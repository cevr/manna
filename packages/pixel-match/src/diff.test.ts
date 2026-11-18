/* oxlint-disable effect/noTernary, effect/noNullish -- a property test's arithmetic: a byte moved up or down past the limit; a pair scored whole has no bands (undefined, as `scorePair` takes it). */
import { describe, expect, test } from 'bun:test';
import { Arbitrary, Effect, Schema } from 'effect';

import { ladder, scorePair, type Mask } from './diff.ts';
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

/** A case: a picture, masks over it, a channel limit and the pixels to change, each with the colour (0 red, 1 green, 2 blue) moved. */
const cases = Arbitrary.all([
  picture,
  Arbitrary.array(mask, { maxLength: 3 }),
  int(0, 64),
  Arbitrary.array(Arbitrary.all([int(0, 80), int(0, 2)]), { maxLength: 20 }),
]);

/** `picture` with the colour each pick names at its pixel moved more than `channel` away. */
const changed = (
  base: Picture,
  picks: ReadonlyArray<readonly [number, number]>,
  channel: number,
): Picture => {
  const rgba = Uint8Array.from(base.rgba);
  for (const [at, colour] of picks) {
    const byte = rgba[at * 4 + colour] ?? 0;
    rgba[at * 4 + colour] = byte > 255 - (channel + 1) ? byte - (channel + 1) : byte + channel + 1;
  }
  return { ...base, rgba };
};

/** The strict diff of two whole pictures: `scorePair` with no bands. */
const diff = (reference: Picture, screen: Picture, masks: ReadonlyArray<Mask>, channel: number) =>
  scorePair(reference, screen, masks, channel, undefined).scored;

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
      const under = (at: number) => {
        const [x, y] = [at % base.width, Math.floor(at / base.width)];
        return masks.some((m) => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height);
      };
      const inside = picks.filter(([at]) => at < base.width * base.height);
      const once = [...new Map(inside.map(([at, colour]) => [at, colour] as const)).entries()];
      const outside = once.map(([at]) => at).filter((at) => !under(at));
      const scored = diff(base, changed(base, once, channel), masks, channel);
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

  test('the largest region is its 8-connected differing pixels', () => {
    const black: Picture = { width: 4, height: 4, rgba: new Uint8Array(64) };
    /** `black` with a red pixel wherever `marks` holds 1. */
    const marked = (marks: ReadonlyArray<number>): Picture => ({
      ...black,
      rgba: Uint8Array.from(black.rgba, (_, i) => (i % 4 === 0 ? (marks[i / 4] ?? 0) * 255 : 0)),
    });
    const largest = (marks: ReadonlyArray<number>) => {
      const scored = diff(black, marked(marks), [], 16);
      return scored._tag === 'Scored' ? scored.largest : -1;
    };
    expect(largest([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1])).toBe(5);
    expect(largest([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toBe(4);
    expect(largest(new Array(16).fill(0))).toBe(0);
  });

  test("a picture's band against the same rows of another picture differs nowhere, cut to the shorter band", () =>
    holds(
      Arbitrary.all([picture, int(0, 9), int(0, 9), int(0, 4), int(0, 1)]),
      ([base, first, last, shift, foot]) => {
        const [top, bottom] = [Math.min(first, last), Math.max(first, last)];
        const stride = base.width * 4;
        const padded: Picture = {
          width: base.width,
          height: base.height + shift,
          rgba: Uint8Array.from([...new Uint8Array(shift * stride).fill(200), ...base.rgba]),
        };
        const anchor = foot === 1 ? 'bottom' : 'top';
        const longer =
          anchor === 'top'
            ? { top: top + shift, bottom: bottom + shift + 2 }
            : { top, bottom: Math.min(bottom, base.height) + shift };
        const bands = { reference: { top, bottom }, screen: longer, anchor } as const;
        const { scored, reference } = scorePair(base, padded, [], 0, bands);
        const height = Math.max(0, Math.min(bottom, base.height) - Math.min(top, base.height));
        return (
          scored._tag === 'Scored' &&
          scored.differing === 0 &&
          reference.height === height &&
          scored.total === base.width * height
        );
      },
    ));

  test("a scored pair's picture is the whole reference's pixels, its total the band's", () =>
    holds(
      Arbitrary.all([picture, int(0, 9), int(0, 9), int(0, 1)]),
      ([base, first, last, foot]) => {
        const band = { top: Math.min(first, last), bottom: Math.max(first, last) };
        const anchor = foot === 1 ? 'bottom' : 'top';
        const banded = scorePair(base, base, [], 0, { reference: band, screen: band, anchor });
        const whole = scorePair(base, base, [], 0, undefined);
        const height = Math.min(band.bottom, base.height) - Math.min(band.top, base.height);
        return (
          banded.picture === base.width * base.height &&
          banded.scored._tag === 'Scored' &&
          banded.scored.total === base.width * height &&
          whole.picture === base.width * base.height &&
          whole.scored._tag === 'Scored' &&
          whole.scored.total === whole.picture
        );
      },
    ));

  test("a mask drawn on the reference's whole picture covers the same row once the band is cut", () => {
    /** A picture 3 wide and `height` tall, black, with row `red` red. */
    const rows = (height: number, red: number): Picture => ({
      width: 3,
      height,
      rgba: Uint8Array.from({ length: 3 * height * 4 }, (_, i) =>
        (i % 4 === 0 && Math.floor(i / 12) === red) || i % 4 === 3 ? 255 : 0,
      ),
    });
    const reference = rows(8, -1);
    const screen = rows(10, 7);
    const bands = {
      reference: { top: 2, bottom: Number.POSITIVE_INFINITY },
      screen: { top: 4, bottom: 10 },
      anchor: 'top',
    } as const;
    const row5: Mask = { x: 0, y: 5, width: 3, height: 1, reason: 'the row the screen differs on' };
    const masked = scorePair(reference, screen, [row5], 0, bands).scored;
    const bare = scorePair(reference, screen, [], 0, bands).scored;
    expect(masked._tag === 'Scored' && [masked.differing, masked.masked, masked.total]).toEqual([
      0, 3, 18,
    ]);
    expect(bare._tag === 'Scored' && bare.differing).toBe(3);
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
