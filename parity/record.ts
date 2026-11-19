// Records the TypeScript CLI's results for a suite and seed into
// parity/frozen/<suite>-<seed>.json. Run once at a named reference commit:
//   bun parity/record.ts --case=verse --seed=42
// No network: every step runs in the scratch world of parity/world.ts.
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { frozenPath, type Recorded } from "./frozen";
import { execute } from "./process";
import { suites } from "./suites";
import { referenceProgram, storeDigests, world } from "./world";

process.umask(0o022);
const root = resolve(import.meta.dir, "..");
const flag = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const name = flag("case");
const seed = Number(flag("seed") ?? 42);
if (!name || !(name in suites)) throw new Error(`--case=<${Object.keys(suites).join("|")}> is required`);
const suite = suites[name]!;
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
const file: Recorded = { header: { reference: head, stores: storeDigests(suite.stores) }, cases: {} };
for (const session of suite.sessions(seed)) {
  const { dir, env } = await world(session.name, suite.stores);
  for (const [index, step] of session.steps.entries())
    file.cases[`${session.name}#${index}`] = await execute(referenceProgram, step, dir, env);
}
const path = frozenPath(name, seed);
await mkdir(dirname(path), { recursive: true });
await writeFile(path, JSON.stringify(file, null, 1) + "\n");
console.log(`recorded ${Object.keys(file.cases).length} steps into ${path} at ${head}`);
