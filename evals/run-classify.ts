// Runs the classify task's exact prompt against the fast model, outside the app (no DB),
// for promptfoo. Reads { question, locale } on stdin, prints the post-validated output.
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { violatesPolicy } from "@/lib/ai/policy";
import { buildMessages } from "@/lib/ai/runAI";
import { classifyTask, type ClassifyInput } from "@/lib/ai/tasks/classify";

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw) as ClassifyInput;
  const { system, userText } = buildMessages(classifyTask, input);
  const { output } = await generateText({
    model: anthropic(process.env.ANTHROPIC_MODEL_FAST!),
    system,
    prompt: userText,
    output: Output.object({ schema: classifyTask.schema }),
    abortSignal: AbortSignal.timeout(30_000),
  });
  const checked = classifyTask.postValidate(output, input);
  const result = checked.ok ? checked.output : { error: checked.reason };
  process.stdout.write(JSON.stringify(violatesPolicy(result) ? { error: "policy" } : result));
}

void main();
