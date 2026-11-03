import { describe, expect, test } from 'bun:test';
import { Effect, Exit, Layer } from 'effect';
import type { Ramp } from '../canvas/colour.ts';
import type { PuppetSpec } from '../canvas/puppet.ts';
import { PuppetImages, PuppetUnloadable } from './images.ts';
import { puppetFrom } from './load.ts';

const specOf = (ramp: Ramp): PuppetSpec => ({
  key: 'test/sleeve',
  size: [8, 8],
  parts: [{ name: 'sleeve', png: 'sleeve.png', ramp }],
  skeleton: { bones: [{ name: 'lean', pivot: [4, 8], tip: [4, 0] }], skin: { sleeve: ['lean'] } },
  origin: [0, 0],
});

const refusalOf = (spec: PuppetSpec) => {
  const asked: string[] = [];
  const images = Layer.succeed(
    PuppetImages,
    PuppetImages.of({
      read: (png) =>
        Effect.sync(() => asked.push(png)).pipe(
          Effect.andThen(PuppetUnloadable.make({ puppet: png, reason: 'not read in this test' })),
        ),
      paints: false,
    }),
  );
  const exit = Effect.runSyncExit(puppetFrom(spec).pipe(Effect.provide(images)));
  const reason = Exit.match(exit, {
    onFailure: (cause) => String(cause),
    onSuccess: () => 'loaded',
  });
  return { asked, reason };
};

describe("a puppet's load", () => {
  test('refuses a part whose declared ramp no dye can map from, naming the part, before reading a PNG', () => {
    const { asked, reason } = refusalOf(
      specOf({ shade: '#e0d0c0', base: '#a09080', light: '#605040' }),
    );
    expect(reason).toContain(
      'sleeve: the drawn ramp #e0d0c0 #a09080 #605040 does not rise in lightness from above the ink cut',
    );
    expect(asked).toEqual([]);
  });

  test('reads the PNGs of a puppet whose declared ramps rise', () => {
    const { asked, reason } = refusalOf(
      specOf({ shade: '#8a7f70', base: '#b8ab98', light: '#ddd2c0' }),
    );
    expect(asked).toEqual(['sleeve.png']);
    expect(reason).toContain('not read in this test');
  });
});
