// Fails if source uses physical left/right utilities or CSS properties.
// Use logical ones instead: ms/me, ps/pe, start/end, border-s/e, rounded-s/e, text-start/end.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components", "lib"];
const value = String.raw`-(?:\d|\[|px\b|auto\b|full\b)`;
const RULES = [
  [/\.(tsx|ts)$/, new RegExp(String.raw`(?<![\w-])-?(?:m[lr]|p[lr]|scroll-[mp][lr]|left|right|inset-[lr])${value}`, "g")],
  [/\.(tsx|ts)$/, /(?<![\w-])(?:border-[lr]|rounded-(?:[lr]|tl|tr|bl|br))(?=[-\s"'`]|$)/g],
  [/\.(tsx|ts)$/, /(?<![\w-])(?:text|float|clear)-(?:left|right)(?![\w-])/g],
  [/\.css$/, /\b(?:margin|padding|border)-(?:left|right)\b|(?<![\w-])(?:left|right)\s*:/g],
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

let failures = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, "utf8").split("\n");
    for (const [fileRe, re] of RULES) {
      if (!fileRe.test(file)) continue;
      lines.forEach((line, i) => {
        for (const match of line.matchAll(re)) {
          failures++;
          console.error(`${file}:${i + 1}  physical "${match[0]}"; use a logical equivalent`);
        }
      });
    }
  }
}

if (failures) process.exit(1);
console.log("No physical left/right styles found.");
