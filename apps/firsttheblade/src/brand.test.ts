/**
 * The brand the owner picked (2026-10-24): Moonlit wheat, lockup D in small
 * capitals with the bare wheat, the series marks in fine lines, and no cut
 * paper on the site or in the kit, read from the sources.
 */
import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path } from 'effect';

import { PALETTE } from './palette.ts';

const test = it.effect.layer(BunServices.layer);

const read = (file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* fs.readFileString(path.join(import.meta.dir, file));
  });

const exists = (file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* fs.exists(path.join(import.meta.dir, file));
  });

/** OKLCH of a `#rrggbb`. */
const oklch = (hex: string) => {
  const lin = (c: number) => {
    if (c <= 0.04045) return c / 12.92;
    return ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { C: Math.hypot(A, B), H: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
};

const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

const WHEAT = '#ffefae';
const NIGHT = '#12354e';
/** Below this chroma a colour reads as grey, so its hue says nothing. */
const GREY = 0.035;
/** How far a role's hue may move from the wheat's or the night's. */
const HUE = 15;

const EMBLEMS = ['path', 'land', 'taught', 'remedies'] as const;

describe('the brand: Moonwheat, small capitals, fine lines, no cut paper', () => {
  test('the palette is Moonwheat: the wheat is #ffefae and the night #12354e', () =>
    Effect.sync(() => {
      const roles: Record<string, string> = PALETTE;
      expect(roles['wheat']).toBe(WHEAT);
      expect(roles['night']).toBe(NIGHT);
    }));

  test('every role but the dusk’s and the painted sky’s keeps the wheat’s hue or the night’s, or is a grey between them', () =>
    Effect.sync(() => {
      const wheat = oklch(WHEAT).H;
      const night = oklch(NIGHT).H;
      const strays = Object.entries(PALETTE)
        .filter(([role]) => !role.startsWith('dusk') && role !== 'sky')
        .filter(([, hex]) => {
          const { C, H } = oklch(hex);
          return C >= GREY && apart(H, wheat) > HUE && apart(H, night) > HUE;
        });
      expect(strays).toEqual([]);
    }));

  test('no paper is torn, tilted or shadowed, on the site or in the kit', () =>
    Effect.gen(function* () {
      const css = yield* read('styles.css');
      const cuts = ['--torn', '--tilt', 'polygon(', 'box-shadow'];
      expect(cuts.filter((cut) => css.includes(cut))).toEqual([]);
      expect(Object.keys(PALETTE).filter((role) => role === 'strip' || role === 'shadow')).toEqual(
        [],
      );
      const kit = yield* read('../kit/draw.ts');
      expect(kit.includes('polygon(')).toBe(false);
    }));

  test('the lockup is the bare wheat beside the wordmark in small capitals', () =>
    Effect.gen(function* () {
      const brand = yield* read('ui/brand.tsx');
      expect({ disc: brand.includes('MARK'), wheat: brand.includes('wheat') }).toEqual({
        disc: false,
        wheat: true,
      });
      expect(yield* exists('art/wheat.svg')).toBe(true);
      const css = yield* read('styles.css');
      const open = css.indexOf('.wordmark {');
      expect(open).toBeGreaterThan(-1);
      expect(
        css.slice(open, css.indexOf('}', open)).includes('font-variant-caps: all-small-caps'),
      ).toBe(true);
    }));

  test('no page draws the mark in its disc', () =>
    Effect.gen(function* () {
      const files = ['ui/art.ts', 'ui/parts.tsx', 'ui/mail.tsx', 'views.tsx', 'ui/brand.tsx'];
      const drawing: Array<string> = [];
      for (const file of files) {
        if (/mark-(112|320)|MARK\.(small|large)/.test(yield* read(file))) drawing.push(file);
      }
      expect(drawing).toEqual([]);
      expect(yield* exists('art/mark-112.webp')).toBe(false);
      expect(yield* exists('art/mark-320.webp')).toBe(false);
    }));

  test('every series mark is drawn in fine lines: no fill but none, no clip, a stroke', () =>
    Effect.gen(function* () {
      for (const id of EMBLEMS) {
        const svg = yield* read(`art/emblem-${id}.svg`);
        const fills = Array.from(svg.matchAll(/fill(?:="|:\s*)([^";]+)/g), (found) => found[1]);
        expect({ id, fills: fills.filter((fill) => fill !== 'none') }).toEqual({ id, fills: [] });
        expect({ id, clip: svg.includes('<clipPath'), stroke: /stroke(?:="|:)/.test(svg) }).toEqual(
          {
            id,
            clip: false,
            stroke: true,
          },
        );
      }
      // The leaf the page lays into the book (`ui/emblems.ts`) is drawn the same way.
      expect(/fill="#|<clipPath/.test(yield* read('ui/emblems.ts'))).toBe(false);
    }));
});
