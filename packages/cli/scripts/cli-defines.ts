/** The build-time facts a compiled CLI carries: the short commit it was built
 *  from, which `--version` prints. Shared by `build.ts` and the test that
 *  compiles a relocated binary, so both bake the same globals. */
export const cliDefines = (commit: string) => ({
  'globalThis.__MANNA_CLI_COMMIT__': JSON.stringify(commit),
});
