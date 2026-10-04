"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { requireAsker } from "@/lib/auth/dal";
import { type FormState, LocaleField } from "@/lib/auth/forms";
import { QUESTION_MAX, TOPICS } from "@/lib/chat/types";
import { getDefaultOrg } from "@/lib/db/queries/org";
import { getOpenConversationId } from "@/lib/db/queries/conversations";
import { createClient } from "@/lib/db/server";
import { createServiceClient } from "@/lib/db/service";
import { logServerError } from "@/lib/log";

const Input = z.object({
  locale: LocaleField,
  question: z.string().trim().min(1).max(QUESTION_MAX),
  topic: z.enum(TOPICS).optional().or(z.literal("").transform(() => undefined)),
});

/**
 * Manual path: the question becomes an intake, a waiting conversation and the first
 * message, then routing tries to find a free daee. Nobody free is not an error.
 */
export async function startConversation(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = Input.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "questionInvalid" };
  const { locale, question } = parsed.data;
  const topic = parsed.data.topic ?? "general";

  const asker = await requireAsker(locale);
  const existing = await getOpenConversationId(asker.user_id);
  if (existing) return redirect({ href: `/chat/${existing}`, locale });

  let org: Awaited<ReturnType<typeof getDefaultOrg>>;
  try {
    org = await getDefaultOrg();
  } catch (error) {
    logServerError("startConversation.getDefaultOrg", error);
    return { error: "generic" };
  }

  const supabase = await createClient();
  const { data: intake, error: intakeError } = await supabase
    .from("intakes")
    .insert({
      asker_id: asker.user_id,
      raw_text: question,
      language: asker.language,
      topic,
      generated_by: "manual",
      status: "routed",
    })
    .select("id")
    .single();
  if (intakeError) {
    logServerError("startConversation.insertIntake", intakeError);
    return { error: "generic" };
  }

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({ org_id: org.id, asker_id: asker.user_id, intake_id: intake.id, topic, status: "waiting" })
    .select("id")
    .single();
  if (convError) {
    logServerError("startConversation.insertConversation", convError);
    return { error: "generic" };
  }

  const { error: messageError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    sender_id: asker.user_id,
    sender_role: "asker",
    body: question,
  });
  if (messageError) logServerError("startConversation.insertMessage", messageError);

  // Events are admin-only in RLS; written with the service client.
  const { error: eventError } = await createServiceClient().from("events").insert({
    org_id: org.id,
    type: "intake_created",
    conversation_id: conversation.id,
    actor_role: "asker",
    meta: { topic, language: asker.language, generated_by: "manual" },
  });
  if (eventError) logServerError("startConversation.logIntakeCreated", eventError);

  // Logs `routed` itself when it assigns someone.
  const { error: routeError } = await supabase.rpc("route_conversation", { conv: conversation.id });
  if (routeError) logServerError("startConversation.route", routeError, { conversationId: conversation.id });

  return redirect({ href: `/chat/${conversation.id}`, locale });
}
