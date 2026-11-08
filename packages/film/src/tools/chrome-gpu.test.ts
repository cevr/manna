import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import { launchArgs } from './browser.ts';
import { drawsOnGpu } from './chrome-gpu.ts';

describe('which Chrome runs its GPU', () => {
  it.effect('the renderer on macOS, which asks for the GPU', () =>
    Effect.sync(() => {
      expect(drawsOnGpu('darwin', launchArgs)).toBe(true);
    }),
  );

  it.effect('no Chrome on Linux, whatever its flags; none that asks for no GPU', () =>
    Effect.sync(() => {
      expect(drawsOnGpu('linux', launchArgs)).toBe(false);
      expect(drawsOnGpu('darwin', ['--disable-gpu-vsync'])).toBe(false);
    }),
  );
});
