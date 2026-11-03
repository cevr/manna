export const readsEnv = (preload: string, log: string) => ({
  BUN_OPTIONS: `--preload=${preload}`,
  MANNA_TEST_READS: log,
  BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
});
