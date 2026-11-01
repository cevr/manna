/**
 * The environment `test-reads.ts` adds to each workspace's `bun run test`:
 * the read recorder (`preload.ts`) preloaded into every bun process the tests
 * start, the log it appends each read to, and Bun's runtime transpiler cache
 * off. Outside `bun test`, Bun keeps the preload's transpiled text in
 * `$HOME/Library/Caches/bun/@t@`, so with the cache on, a bun process a test
 * starts writes into its HOME where the same process without the preload
 * writes nothing (`vector-compiler/paths.test.ts` holds a child's HOME empty).
 */
export const readsEnv = (preload: string, log: string) => ({
  BUN_OPTIONS: `--preload=${preload}`,
  MANNA_TEST_READS: log,
  BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
});
