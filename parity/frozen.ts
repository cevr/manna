// The TypeScript CLI's outputs, recorded once by parity/record.ts and checked
// in under parity/frozen/<suite>-<seed>.json. The port is checked against
// these records. A record file holds a header (the reference commit and the
// sha256 of every store file the suite reads) and one result per case key.
//
// A check that meets a case with no record fails and names it, and a full run
// (no --case) fails when a record is never used, so the corpus and its records
// cannot drift apart.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

process.umask(0o022);

export type Header = { reference: string; stores: Record<string, string> };
export type Recorded = { header: Header; cases: Record<string, unknown> };

export const frozenPath = (suite: string, seed: number) =>
  join(import.meta.dir, "frozen", `${suite}-${seed}.json`);

export function frozen(suite: string, seed: number, selected: boolean) {
  const path = frozenPath(suite, seed);
  if (!existsSync(path))
    throw new Error(
      `no frozen reference ${path}: the recorded seeds are the files in parity/frozen`,
    );
  const file: Recorded = JSON.parse(readFileSync(path, "utf8"));
  const used = new Set<string>();
  return {
    header: file.header,
    get<T>(key: string): T {
      if (used.has(key)) throw new Error(`${suite}: case key ${key} is not unique`);
      used.add(key);
      if (!(key in file.cases))
        throw new Error(`${suite} seed ${seed}: no frozen reference for ${key}`);
      return structuredClone(file.cases[key]) as T;
    },
    done() {
      if (selected) return;
      const unused = Object.keys(file.cases).filter((key) => !used.has(key));
      if (unused.length)
        throw new Error(`${suite} seed ${seed}: records no case reached: ${unused.join(", ")}`);
    },
  };
}
