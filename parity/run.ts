// Builds Go because CLI bytes and exit statuses are the contract; a checker
// cannot observe those process boundaries.
//
// Compares a candidate binary with the frozen TypeScript records:
//   bun parity/run.ts --case=verse --seed=42 [--binary=bin/manna-ergo] [--session=<name>]
// Refuses to run when a store differs from the one the records were made on.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { frozen } from "./frozen";
import { execute, type Result } from "./process";
import { suites } from "./suites";
import { storeDigests, world } from "./world";

const root = resolve(import.meta.dir, "..");
const flag = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const name = flag("case");
const seed = Number(flag("seed") ?? 42);
const only = flag("session");
const candidate = resolve(root, flag("binary") ?? "bin/manna-ergo");
if (!name || !(name in suites)) throw new Error(`--case=<${Object.keys(suites).join("|")}> is required`);
if (!existsSync(candidate)) throw new Error(`no candidate binary ${candidate}`);
const suite = suites[name]!;
const records = frozen(name, seed, Boolean(only));
const stores = storeDigests(suite.stores);
if (JSON.stringify(stores) !== JSON.stringify(records.header.stores))
  throw new Error(
    `store identity differs from the records: ${JSON.stringify(stores)} vs ${JSON.stringify(records.header.stores)}`,
  );
let compared = 0;
for (const session of suite.sessions(seed).filter((s) => !only || s.name === only)) {
  const { dir, env } = await world(session.name, suite.stores);
  for (const [index, step] of session.steps.entries()) {
    const reference = records.get<Result>(`${session.name}#${index}`);
    const actual = await execute([candidate], step, dir, env);
    if (step.usage) {
      if (reference.code !== actual.code || actual.err === "")
        throw new Error(`usage lost its error or status: ${JSON.stringify(step.args)}`);
      actual.out = reference.out;
      actual.err = reference.err;
    }
    if (JSON.stringify(reference) !== JSON.stringify(actual)) {
      console.error(
        JSON.stringify(
          {
            session: session.name,
            seed,
            step,
            reference,
            actual,
            replay: `bun parity/run.ts --case=${name} --seed=${seed} --session=${session.name}`,
          },
          null,
          2,
        ),
      );
      throw new Error(`${session.name}: parity mismatch`);
    }
    compared++;
  }
  console.log(`ok ${session.name}`);
}
if (!compared) throw new Error("No cases selected");
records.done();
console.log(`PARITY EXIT: 0 (${compared} process pairs, case ${name}, seed ${seed})`);
