/** A word that names a TypeScript file. */
const TS_FILE = /^\S+\.tsx?$/u;

/**
 * The TypeScript files a shell text runs with `bun`, in order: on each line
 * whose first word is `bun`, the first word after it that ends in `.ts` or
 * `.tsx`. A `#` comment line runs nothing, and neither does a `bun` line
 * that names no such file (`bun run lint`).
 */
export const shellRuns = (text: string): ReadonlyArray<string> =>
  text.split('\n').flatMap((line) => {
    const [first, ...rest] = line.trim().split(/\s+/u);
    if (first !== 'bun') return [];
    return rest.filter((word) => TS_FILE.test(word)).slice(0, 1);
  });

/** A package script that runs a shell file with `sh` or `bash`: the file's path, captured. */
export const RUNS_SHELL = /(?:^|[\s;&|(])(?:sh|bash)\s+(\S+\.sh)(?=\s|$)/gu;
