// promptfoo provider: the classify task through evals/run-classify.ts (same prompt as the app).
import { execFileSync } from "node:child_process";

export default class ClassifyProvider {
  id() {
    return "wasl-classify";
  }
  async callApi(_prompt, context) {
    const { question, locale } = context.vars;
    const out = execFileSync("npx tsx --env-file=.env.local --conditions=react-server evals/run-classify.ts", {
      input: JSON.stringify({ question, locale }),
      encoding: "utf8",
      shell: true,
      timeout: 60_000,
    });
    return { output: out };
  }
}
