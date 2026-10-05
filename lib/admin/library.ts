"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getStaff } from "@/lib/auth/dal";
import { createClient } from "@/lib/db/server";
import { logServerError } from "@/lib/log";

const Id = z.uuid();

async function adminClient() {
  const staff = await getStaff();
  return staff?.role === "admin" ? createClient() : null;
}

/** An admin vouches for an automatically verified reading: it becomes human-verified. */
export async function promoteReading(id: string): Promise<{ ok: boolean }> {
  const db = await adminClient();
  if (!db || !Id.safeParse(id).success) return { ok: false };
  const { error } = await db.from("library_items").update({ verified_by: "human" }).eq("id", id).eq("verified_by", "auto");
  if (error) logServerError("promoteReading", error);
  revalidatePath("/[locale]/admin/settings", "page");
  return { ok: !error };
}

/** An admin removes an automatically verified reading from the cache. */
export async function removeReading(id: string): Promise<{ ok: boolean }> {
  const db = await adminClient();
  if (!db || !Id.safeParse(id).success) return { ok: false };
  const { error } = await db.from("library_items").delete().eq("id", id).eq("verified_by", "auto");
  if (error) logServerError("removeReading", error);
  revalidatePath("/[locale]/admin/settings", "page");
  return { ok: !error };
}
