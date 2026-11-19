// Runs the Ergo port's mutant ledger (ergo/mutants.json): each mutant is
// applied to its file, `ergo test` runs the package, and the mutant must be
// killed by one of its named killers. The file is restored after each run.
//   ERGO=/path/to/ergo bun scripts/ergo-mutants.ts [--only=NAME]
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type Mutant = { name: string; file: string; from: string; to: string; killers: string[] };

const root = join(import.meta.dir, "..", "ergo");
const ergo = process.env.ERGO ?? "ergo";
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const ledger: { mutants: Mutant[] } = JSON.parse(readFileSync(join(root, "mutants.json"), "utf8"));

function test(pkg: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ergo, ["test", pkg], { cwd: root, detached: true, env: { ...process.env, ERGO_LAWCACHE: "off" } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.once("error", reject);
    child.once("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

let fail = 0;
for (const m of ledger.mutants) {
  if (only && m.name !== only) continue;
  const path = join(root, m.file);
  const original = readFileSync(path, "utf8");
  const at = original.indexOf(m.from);
  if (at < 0 || original.indexOf(m.from, at + 1) >= 0) {
    console.log(`FAIL ${m.name}: "from" is not found once in ${m.file}`);
    fail = 1;
    continue;
  }
  writeFileSync(path, original.slice(0, at) + m.to + original.slice(at + m.from.length));
  try {
    const r = await test("./" + dirname(m.file));
    const failed = r.out
      .split("\n")
      .filter((l) => l.startsWith("FAIL "))
      .map((l) => l.slice(5).replace(/^law /, "").split(/[: ]/)[0]);
    const killer = m.killers.find((k) => failed.includes(k));
    if (r.code !== 0 && killer) console.log(`ok ${m.name}: killed by ${killer}`);
    else if (r.code !== 0 && failed.length === 0) {
      console.log(`FAIL ${m.name}: the package fails to build or check, not killed by a test\n${r.out.slice(0, 600)}`);
      fail = 1;
    } else {
      console.log(`FAIL ${m.name}: survived (failed: ${failed.join(", ") || "none"})`);
      fail = 1;
    }
  } finally {
    writeFileSync(path, original);
  }
}
console.log(`MUTANTS EXIT: ${fail}`);
process.exit(fail);
