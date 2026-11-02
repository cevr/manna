// The cloth dye's promises, held over generated cloths and pixels: alpha is
// kept, a pixel at or under the ink cut is kept, the drawn shade, base and
// light land on the cloth's ramp within 1/255, and lightness keeps its
// order. Each draw is seeded, so a failure names the seed that gave it.

import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { type Hex, type Ramp, type Shading, channelsOf, ramp } from './colour.ts';
import { type Dye, INK_CUT, dyeKnots, dyePixel, dyedRaster, dyedRgb, lightnessOf } from './dye.ts';

/** The house's key light and knobs (`style/house.ts`, which the engine may not import): a cloth's ramp as the look's `shaded()` gives it. */
const KEY: Hex = '#f3e9c8';
const SHADING: Shading = {
  turn: 20,
  dark: 0.22,
  lift: 0.4,
  deep: 13.5,
  neutral: 0.65,
  warm: 8.5,
  fade: 0.6,
};
const clothRamp = (base: Hex): Ramp => ramp(base, KEY, SHADING);

/** A seeded generator of 0..1 (mulberry32). */
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type Rng = ReturnType<typeof seeded>;
type Rgb = readonly [number, number, number];

const byte = (rng: Rng) => Math.floor(rng() * 256);
const hexOf = (rng: Rng): Hex =>
  `#${[byte(rng), byte(rng), byte(rng)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** Pair `seed`: a part drawn in one random cloth's ramp, worn in another's. */
const pairOf = (seed: number) => {
  const rng = seeded(seed);
  const drawn = clothRamp(hexOf(rng));
  const cloth = clothRamp(hexOf(rng));
  return { drawn, cloth, made: dyeKnots(drawn, cloth) };
};

/** The dyes of the first `count` pairs, each with its seed; the pairs the dye refuses left out. */
const dyes = (count: number): ReadonlyArray<{ readonly seed: number; readonly dye: Dye }> =>
  Array.from({ length: count }, (_, seed) =>
    Result.match(pairOf(seed).made, {
      onSuccess: (dye) => [{ seed, dye }],
      onFailure: () => [],
    }),
  ).flat();

const PAIRS = 200;
const DYES = dyes(PAIRS);

const L = (rgb: Rgb) => lightnessOf(rgb[0], rgb[1], rgb[2]);

describe('a cloth dye', () => {
  test('most generated pairs dye: the refusals are the ramps that sink to the ink', () => {
    expect(DYES.length).toBeGreaterThan(PAIRS * 0.8);
  });

  test('keeps every pixel its alpha', () => {
    for (const { seed, dye } of DYES) {
      const rng = seeded(seed + 1000);
      const rgba = Uint8Array.from({ length: 64 * 4 }, () => byte(rng));
      const alphas = Array.from({ length: 64 }, (_, i) => rgba[i * 4 + 3]);
      for (let i = 0; i < 64; i++) dyePixel(dye, rgba, i);
      expect(Array.from({ length: 64 }, (_, i) => rgba[i * 4 + 3])).toEqual(alphas);
    }
  });

  test('keeps a pixel at or under the ink cut as it is: the line and its ink', () => {
    let under = 0;
    for (const { seed, dye } of DYES) {
      const rng = seeded(seed + 2000);
      for (let n = 0; n < 32; n++) {
        const k = rng() * 0.25;
        const rgb: Rgb = [
          Math.round(byte(rng) * k),
          Math.round(byte(rng) * k),
          Math.round(byte(rng) * k),
        ];
        if (L(rgb) > INK_CUT) continue;
        under++;
        expect(dyedRgb(dye, ...rgb)).toEqual(rgb);
      }
    }
    expect(under).toBeGreaterThan(1000);
  });

  test('lands the drawn shade, base and light on the cloth ramp within 1/255', () => {
    for (let seed = 0; seed < PAIRS; seed++) {
      const { drawn, cloth, made } = pairOf(seed);
      if (Result.isFailure(made)) continue;
      for (const key of ['shade', 'base', 'light'] as const) {
        const got = dyedRgb(made.success, ...channelsOf(drawn[key]));
        const want = channelsOf(cloth[key]);
        for (let c = 0; c < 3; c++)
          expect(Math.abs((got[c] ?? -9) - (want[c] ?? 0))).toBeLessThanOrEqual(1);
      }
    }
  });

  test('keeps lightness in order: a lighter pixel never dyes darker', () => {
    // the 8-bit rounding and the gamut's clamp moved a dyed pixel's L* by at most 0.3 over 2000 pairs of 200 pixels each, measured once (2026-11-02); this case runs the 48 pixels of each pair here, held to 0.5
    for (const { seed, dye } of DYES) {
      const rng = seeded(seed + 3000);
      const pixels = Array.from({ length: 48 }, (): Rgb => [byte(rng), byte(rng), byte(rng)]);
      const out = pixels.toSorted((p, q) => L(p) - L(q)).map((p) => L(dyedRgb(dye, ...p)));
      for (let i = 1; i < out.length; i++)
        expect(out[i] ?? 0).toBeGreaterThanOrEqual((out[i - 1] ?? 0) - 0.5);
    }
  });

  test('dyes a raster pixel by pixel into a new one, its size and alpha kept', () => {
    const dye = Result.getOrThrow(dyeKnots(clothRamp('#d1c6b4'), clothRamp('#4b566b')));
    const bytes = () => Uint8Array.from({ length: 6 * 4 }, (_, i) => (i * 37) % 256);
    const raster = { width: 3, height: 2, rgba: bytes() };
    const want = bytes();
    for (let i = 0; i < 6; i++) dyePixel(dye, want, i);
    const got = dyedRaster(dye, raster);
    expect([got.width, got.height]).toEqual([3, 2]);
    expect(got.rgba).toEqual(want);
    expect(raster.rgba).toEqual(bytes());
  });

  test('refuses a drawn ramp that does not rise in lightness from above the ink cut', () => {
    const cloth = clothRamp('#ab8163');
    const backwards: Ramp = { shade: '#e0d0c0', base: '#a09080', light: '#605040' };
    expect(Result.isFailure(dyeKnots(backwards, cloth))).toBe(true);
    const inky: Ramp = { shade: '#101010', base: '#a09080', light: '#e0d0c0' };
    expect(dyeKnots(inky, cloth)).toEqual(
      Result.fail(
        `the drawn ramp #101010 #a09080 #e0d0c0 does not rise in lightness from above the ink cut (L* ${INK_CUT})`,
      ),
    );
  });

  test("refuses a cloth whose ramp's shade falls at or under the ink cut", () => {
    const dark = clothRamp('#111111');
    expect(L(channelsOf(dark.shade))).toBeLessThanOrEqual(INK_CUT);
    expect(Result.isFailure(dyeKnots(clothRamp('#d1c6b4'), dark))).toBe(true);
  });

  test('dyes the linen tunic to every story kit cloth', () => {
    const drawn = clothRamp('#d1c6b4');
    for (const cloth of ['#ab8163', '#4b566b', '#768059', '#8c7762', '#d1c6b4'] as const)
      expect(Result.isSuccess(dyeKnots(drawn, clothRamp(cloth)))).toBe(true);
  });
});
