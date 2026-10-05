// Runs find_sources outside the app (no DB): the same prompt, the live search, and the fence.
// Reads { question, topic, level, locale, audience } on stdin; prints { items, raw }.
import { buildMessages } from "@/lib/ai/runAI";
import { findSourcesTask, keepApproved, type SourcesInput } from "@/lib/ai/tasks/find-sources";

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw) as SourcesInput;
  if (input.audience === "asker" && (input.level === "c" || input.level === "d")) {
    process.stdout.write(JSON.stringify({ items: [], raw: 0 }));
    return;
  }
  const { system, userText } = buildMessages(findSourcesTask, input);
  const out = (await findSourcesTask.execute!({ model: process.env.ANTHROPIC_MODEL_FAST!, system, userText, signal: AbortSignal.timeout(60_000), input })) as {
    items: { url: string; title: string; cited_text: string }[];
  };
  process.stdout.write(JSON.stringify({ items: keepApproved(out.items, input), raw: out.items.length, rawUrls: out.items.map((i) => i.url) }));
}

void main();
