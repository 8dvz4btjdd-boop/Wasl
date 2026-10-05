// Runs the card task's exact prompt against the model, outside the app (no DB, no logging),
// for promptfoo. Reads { locale, messages } on stdin, prints the post-validated card.
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { buildMessages } from "@/lib/ai/runAI";
import { cardTask, type CardInput } from "@/lib/ai/tasks/card";

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw) as CardInput;
  const { system, userText } = buildMessages(cardTask, input);
  const { output } = await generateText({
    model: anthropic(process.env.ANTHROPIC_MODEL_CARD!),
    system,
    prompt: userText,
    output: Output.object({ schema: cardTask.schema }),
    abortSignal: AbortSignal.timeout(30_000),
  });
  const checked = cardTask.postValidate(output, input);
  process.stdout.write(JSON.stringify(checked.ok ? checked.output : { error: checked.reason }));
}

void main();
