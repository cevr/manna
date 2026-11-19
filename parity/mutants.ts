// Harness mutants: a suite that compares nothing would pass, so each named
// change to a candidate's result must make parity/run.ts fail, and the
// unchanged candidate must pass.
//   bun parity/mutants.ts --case=verse [--seed=42] [--binary=bin/manna-ergo | --reference]
// --reference runs the TypeScript CLI as the candidate (P0, before a port exists).
import { spawnSync } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { referenceProgram, scratchRoot } from "./world";

const root = resolve(import.meta.dir, "..");
const flag = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const name = flag("case");
const seed = flag("seed") ?? "42";
const program = process.argv.includes("--reference")
  ? referenceProgram
  : [resolve(root, flag("binary") ?? "bin/manna-ergo")];
const mutants: Record<string, string[]> = {
  verse: ["drop-newline", "swap-status", "reorder-keys", "drop-stderr", "empty"],
};
const list = name ? mutants[name] : undefined;
if (!list) throw new Error(`--case=<${Object.keys(mutants).join("|")}> is required`);
await mkdir(join(scratchRoot, "mutants"), { recursive: true });
const quote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;
let failed = 0;
for (const mutant of ["none", ...list]) {
  const wrapper = join(scratchRoot, "mutants", `${name}-${mutant}.sh`);
  await writeFile(
    wrapper,
    `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(import.meta.dir, "mutate.ts"))} ${mutant} ${program.map(quote).join(" ")} -- "$@"\n`,
  );
  await chmod(wrapper, 0o755);
  const run = spawnSync(
    process.execPath,
    [join(import.meta.dir, "run.ts"), `--case=${name}`, `--seed=${seed}`, `--binary=${wrapper}`],
    { cwd: root, encoding: "utf8" },
  );
  const passed = run.status === 0;
  const want = mutant === "none";
  console.log(`${passed === want ? "ok" : "FAIL"} ${mutant}: run.ts ${passed ? "passed" : "failed"}`);
  if (passed !== want) failed++;
}
if (failed) {
  console.log(`MUTANTS EXIT: 1 (${failed} wrong)`);
  process.exit(1);
}
console.log(`MUTANTS EXIT: 0 (${list.length} mutants killed, the unchanged candidate passed)`);
