// A wrapper the harness mutants run in place of a candidate: it runs the
// candidate, changes its result in one named way, and passes the rest on.
//   bun parity/mutate.ts <mutant> <candidate...> -- <args...>
import { spawnSync } from "node:child_process";

const [mutant, ...rest] = process.argv.slice(2);
const split = rest.indexOf("--");
const program = rest.slice(0, split);
const args = rest.slice(split + 1);
const run = spawnSync(program[0]!, [...program.slice(1), ...args], {
  input: await Bun.stdin.text(),
  encoding: "utf8",
});
let out = run.stdout ?? "";
let err = run.stderr ?? "";
let code = run.status ?? 1;
switch (mutant) {
  case "none":
    break;
  case "drop-newline":
    out = out.replace(/\n$/, "");
    break;
  case "swap-status":
    code = code === 0 ? 3 : 0;
    break;
  case "reorder-keys":
    // Swap the first two keys of the first JSON object on stdout: compact
    // JSON on one line, or two adjacent indented member lines.
    if (/\{("[^"]*":"[^"]*"),("[^"]*":"[^"]*")/.test(out))
      out = out.replace(/\{("[^"]*":"[^"]*"),("[^"]*":"[^"]*")/, "{$2,$1");
    else {
      const lines = out.split("\n");
      const member = /^\s+"[^"]+": .*,$/;
      const at = lines.findIndex((line, i) => member.test(line) && member.test(lines[i + 1] ?? ""));
      if (at >= 0) [lines[at], lines[at + 1]] = [lines[at + 1]!, lines[at]!];
      out = lines.join("\n");
    }
    break;
  case "drop-stderr":
    err = "";
    break;
  case "empty":
    out = "";
    break;
  default:
    throw new Error(`unknown mutant ${mutant}`);
}
process.stdout.write(out);
process.stderr.write(err);
process.exitCode = code;
