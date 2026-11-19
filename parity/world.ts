// The world every parity step runs in: a scratch HOME, no colour, store paths
// by env. Nothing from the inherited environment reaches the CLI except PATH.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";

export const scratchRoot = process.env.MANNA_PARITY_SCRATCH ?? "/tmp/opencode/portlane/manna-parity";
export const referenceProgram = [process.execPath, join(import.meta.dir, "../packages/cli/src/main.ts")];

export async function world(session: string, stores: Record<string, string>) {
  await mkdir(scratchRoot, { recursive: true });
  const dir = await mkdtemp(join(scratchRoot, `${session}-`));
  await mkdir(join(dir, "home"));
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: join(dir, "home"),
    NO_COLOR: "1",
    TERM: "dumb",
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(scratchRoot, "bun-cache"),
    ...stores,
  };
  return { dir, env };
}

export function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function storeDigests(stores: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(stores).map(([name, path]) => [name, sha256(path)]));
}
