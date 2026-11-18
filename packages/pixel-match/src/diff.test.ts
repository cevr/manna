/* oxlint-disable effect/noTernary -- a property test's arithmetic: a byte moved up or down past the limit. */
import { describe, expect, test } from 'bun:test';
import { Arbitrary, Effect, Schema } from 'effect';

import { diff, ladder, largestRegion, maskMap, type Mask } from './diff.ts';
import { decodePng, encodePng, isBlank, type Picture } from './png.ts';

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

/** A picture of 1 to 9 by 1 to 9 pixels, every byte drawn, opaque. */
const picture = Arbitrary.flatMap(Arbitrary.all([int(1, 9), int(1, 9)]), ([width, height]) =>
  Arbitrary.map(
    Arbitrary.array(int(0, 255), { minLength: width * height * 4, maxLength: width * height * 4 }),
    (bytes): Picture => {
      const rgba = Uint8Array.from(bytes);
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
      return { width, height, rgba };
    },
  ),
);

/** A mask somewhere over (or past) a 9 by 9 picture. */
const mask = Arbitrary.map(
  Arbitrary.all([int(-2, 9), int(-2, 9), int(0, 6), int(0, 6)]),
  ([x, y, width, height]): Mask => ({ x, y, width, height, reason: 'drawn' }),
);

/** A case: a picture, masks over it, a channel limit and the pixels to change. */
const cases = Arbitrary.all([
  picture,
  Arbitrary.array(mask, { maxLength: 3 }),
  int(0, 64),
  Arbitrary.array(int(0, 80), { maxLength: 20 }),
]);

/** `picture` with red at each of `pixels` moved more than `channel` away. */
const changed = (base: Picture, pixels: ReadonlyArray<number>, channel: number): Picture => {
  const rgba = Uint8Array.from(base.rgba);
  for (const at of pixels) {
    const red = rgba[at * 4] ?? 0;
    rgba[at * 4] = red > 255 - (channel + 1) ? red - (channel + 1) : red + channel + 1;
  }
  return { ...base, rgba };
};

const holds = <A>(arbitrary: Arbitrary.Arbitrary<A>, property: (value: A) => boolean) =>
  expect(
    Arbitrary.formatCheckFailure(
      Effect.runSync(Arbitrary.checkEffect(arbitrary, property, { runs: 300, seed: 11 })),
    ),
  ).toBeUndefined();

describe('the strict diff', () => {
  test('a picture against itself differs nowhere, and every pixel is scored or masked', () =>
    holds(cases, ([base, masks, channel]) => {
      const scored = diff(base, base, masks, channel);
      return (
        scored._tag === 'Scored' &&
        scored.differing === 0 &&
        scored.largest === 0 &&
        scored.scored + scored.masked === base.width * base.height
      );
    }));

  test('k pixels changed outside every mask count k; changed inside a mask, 0', () =>
    holds(cases, ([base, masks, channel, picks]) => {
      const under = maskMap(base.width, base.height, masks);
      const pixels = [...new Set(picks.filter((at) => at < base.width * base.height))];
      const outside = pixels.filter((at) => under[at] === 0);
      const scored = diff(base, changed(base, pixels, channel), masks, channel);
      return (
        scored._tag === 'Scored' &&
        scored.differing === outside.length &&
        scored.largest <= outside.length &&
        (outside.length === 0) === (scored.largest === 0)
      );
    }));

  test('a change of at most the channel limit counts 0', () =>
    holds(cases, ([base, masks, channel]) => {
      const rgba = Uint8Array.from(base.rgba, (byte, i) =>
        i % 4 === 3 ? byte : Math.min(255, byte + channel),
      );
      const scored = diff(base, { ...base, rgba }, masks, channel);
      return scored._tag === 'Scored' && scored.differing === 0;
    }));

  test('two sizes fail, never count', () =>
    holds(Arbitrary.all([picture, picture]), ([a, b]) => {
      const scored = diff(a, b, [], 16);
      return (scored._tag === 'Sizes') === (a.width !== b.width || a.height !== b.height);
    }));

  test('a region is its 8-connected pixels', () => {
    const corner = Uint8Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1]);
    expect(largestRegion(corner, 4, 4)).toBe(5);
    const diagonal = Uint8Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(largestRegion(diagonal, 4, 4)).toBe(4);
    expect(largestRegion(new Uint8Array(16), 4, 4)).toBe(0);
  });

  test('the ladder counts fewer pixels at a looser channel', () => {
    const base: Picture = {
      width: 2,
      height: 1,
      rgba: Uint8Array.from([0, 0, 0, 255, 0, 0, 0, 255]),
    };
    const screen: Picture = {
      width: 2,
      height: 1,
      rgba: Uint8Array.from([5, 0, 0, 255, 20, 0, 0, 255]),
    };
    expect(ladder(base, screen, [], [0, 4, 8, 16]).map((step) => step.differing)).toEqual([
      2, 2, 1, 1,
    ]);
  });
});

describe('the PNG codec', () => {
  test('a picture written and read back is the same picture', () =>
    holds(picture, (base) => {
      const back = decodePng(encodePng(base));
      return (
        back.width === base.width &&
        back.height === base.height &&
        back.rgba.every((byte, i) => byte === base.rgba[i])
      );
    }));

  test('bytes that are no PNG are refused', () => {
    expect(() => decodePng(Uint8Array.from([1, 2, 3]), 'junk')).toThrow('junk: not a PNG');
  });

  test('a picture of one colour is blank; one pixel else is not', () => {
    const rgba = new Uint8Array(4 * 4 * 4).fill(240);
    expect(isBlank(encodePng({ width: 4, height: 4, rgba }))).toBe(true);
    rgba[21] = 12;
    expect(isBlank(encodePng({ width: 4, height: 4, rgba }))).toBe(false);
  });
});
