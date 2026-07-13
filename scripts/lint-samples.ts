// CLI profile linter:npm run lint:samples
// 驗收條款(HANDOFF M0):10 份黃金樣本全綠。

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdown } from "../src/parser/parse";
import { lint } from "../src/parser/linter";

const dir = process.argv[2] ?? "examples";
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".md"))
  .sort();

let failed = 0;
for (const file of files) {
  const md = readFileSync(join(dir, file), "utf8");
  const result = lint(parseMarkdown(md));
  const errors = result.messages.filter((m) => m.severity === "error");
  const warnings = result.messages.filter((m) => m.severity === "warning");
  const status = errors.length ? "✗" : "✓";
  console.log(`${status} ${file}  (${errors.length} errors, ${warnings.length} warnings)`);
  for (const m of result.messages) {
    console.log(`    ${m.severity === "error" ? "✗" : "⚠"} ${m.line ? `L${m.line} ` : ""}[${m.rule}] ${m.message}`);
  }
  if (errors.length) failed++;
}

console.log(`\n${files.length - failed}/${files.length} 份樣本通過 profile linter`);
if (failed) process.exit(1);
