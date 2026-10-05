// promptfoo provider: find_sources through evals/run-sources.ts (same prompt, live search, fence).
import { execFileSync } from "node:child_process";

export default class SourcesProvider {
  id() {
    return "wasl-sources";
  }
  async callApi(_prompt, context) {
    const { question, topic, level, locale, audience } = context.vars;
    const out = execFileSync("npx tsx --env-file=.env.local --conditions=react-server evals/run-sources.ts", {
      input: JSON.stringify({ question, topic, level, locale, audience }),
      encoding: "utf8",
      shell: true,
      timeout: 120_000,
    });
    return { output: out };
  }
}
