/**
 * The flag a caller asks for Chrome's GPU with (`launchArgs`,
 * tools/browser.ts): on macOS its Chrome is launched without
 * `--disable-gpu` (`drawsOnGpu`). Chrome itself reads nothing from it.
 */
export const GPU_FLAG = '--enable-gpu';

/** Whether a Chrome asked for with `argv` on `platform` runs its GPU: on macOS, when it asks for it. */
export const drawsOnGpu = (platform: string, argv: ReadonlyArray<string>): boolean =>
  platform === 'darwin' && argv.includes(GPU_FLAG);
