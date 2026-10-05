// promptfoo provider: the card task through evals/run-card.ts (same prompt as the app).
import { execFileSync } from "node:child_process";

export default class CardProvider {
  id() {
    return "wasl-card";
  }
  async callApi(_prompt, context) {
    const { locale, messages } = context.vars;
    const out = execFileSync("npx", ["tsx", "--env-file=.env.local", "--conditions=react-server", "evals/run-card.ts"], {
      input: JSON.stringify({ locale, messages: JSON.parse(messages) }),
      encoding: "utf8",
      shell: true,
      timeout: 60_000,
    });
    return { output: out };
  }
}
