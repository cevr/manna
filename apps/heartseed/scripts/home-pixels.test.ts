/* oxlint-disable effect/noNullish, effect/noTernary -- the pixel walk reads raw bytes in plain loops and keeps its best distance in a plain branch. */

/**
 * The home's icons, drawn in their scheme's colours: an oracle apart from
 * `scripts/home-icons.ts`. For each master and scheme the expected colours
 * are the master's own tokens mapped through `src/theme.ts`'s `masters` and
 * `theme[scheme]`, with `kept` as written. Each committed PNG is mostly
 * transparent, shows each expected colour exactly in at least 40 opaque
 * pixels, and has at most 12 of its pixels at alpha 128 or more lying more
 * than 3 from every blend of two expected colours. The other scheme's
 * colours fail on every PNG, so the oracle tells the schemes apart.
 */

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem } from 'effect';
import sharp from 'sharp';

import { kept, masters, type Scheme, theme } from '../src/theme.ts';

const test = it.effect.layer(BunServices.layer);

/** scripts/ → the app's root. */
const ROOT = `${import.meta.dir}/..`;
const DIR = `${ROOT}/assets/home`;
const SCHEMES: ReadonlyArray<Scheme> = ['light', 'dark'];
const OTHER: Readonly<Record<Scheme, Scheme>> = { light: 'dark', dark: 'light' };

const TRANSPARENT_SHARE = 0.4;
const EXACT_FLOOR = 40;
const OFF_BLEND = 3;
const OFF_ALLOWANCE = 12;

/** The colours a master's tokens are drawn as in a scheme, lower-case; a token neither table names is expected as `unmapped`, which no pixel shows. */
const expectedOf = (svg: string, scheme: Scheme) =>
  Array.from(
    new Set(
      Array.from(svg.matchAll(/#[0-9a-fA-F]{6}\b/gu), (m) => {
        const hex = m[0].toLowerCase();
        const role = masters[hex];
        if (role !== undefined) return theme[scheme][role].toLowerCase();
        return kept.includes(hex) ? hex : 'unmapped';
      }),
    ),
  ).toSorted();

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** The worst-channel distance from a pixel to the nearest blend of two colours. */
const offBlend = (px: readonly number[], colours: ReadonlyArray<readonly number[]>) => {
  let best = Infinity;
  for (const p of colours)
    for (const q of colours) {
      const span = [0, 1, 2].map((c) => (q[c] ?? 0) - (p[c] ?? 0));
      const l2 = span.reduce((s, v) => s + v * v, 0);
      const along =
        l2 === 0
          ? 0
          : [0, 1, 2].reduce((s, c) => s + (span[c] ?? 0) * ((px[c] ?? 0) - (p[c] ?? 0)), 0) / l2;
      const t = Math.min(1, Math.max(0, along));
      const off = Math.max(
        ...[0, 1, 2].map((c) => Math.abs((px[c] ?? 0) - ((p[c] ?? 0) + t * (span[c] ?? 0)))),
      );
      if (off < best) best = off;
    }
  return best;
};

/** A PNG's transparent share, each expected colour's exact opaque count, and its off-blend pixels. */
const measure = (data: Uint8Array, expected: readonly string[]) => {
  const colours = expected.map(rgb);
  const exact = new Map(expected.map((hex) => [hex, 0]));
  let clear = 0;
  let off = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 0;
    if (a === 0) {
      clear++;
      continue;
    }
    const px = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
    if (a === 255) {
      const hex = `#${px.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
      const seen = exact.get(hex);
      if (seen !== undefined) exact.set(hex, seen + 1);
    }
    if (a >= 128 && offBlend(px, colours) > OFF_BLEND) off++;
  }
  return {
    clear: clear / (data.length / 4),
    least: Math.min(...exact.values()),
    off,
  };
};

const pixelsOf = (file: string) =>
  Effect.promise(() => sharp(`${DIR}/${file}`).ensureAlpha().raw().toBuffer()).pipe(
    Effect.map((buffer) => new Uint8Array(buffer)),
  );

const rows = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const names = (yield* fs.readDirectory(DIR))
    .filter((file) => file.endsWith('.svg'))
    .map((file) => file.slice(0, -'.svg'.length))
    .toSorted();
  return yield* Effect.forEach(
    names.flatMap((name) => SCHEMES.map((scheme) => ({ name, scheme }))),
    ({ name, scheme }) =>
      Effect.gen(function* () {
        const svg = yield* fs.readFileString(`${DIR}/${name}.svg`);
        const data = yield* pixelsOf(`${name}-${scheme}.png`);
        return {
          file: `${name}-${scheme}`,
          own: measure(data, expectedOf(svg, scheme)),
          other: measure(data, expectedOf(svg, OTHER[scheme])),
        };
      }),
    { concurrency: 6 },
  );
});

describe('the home’s icons, as drawn', () => {
  test('each PNG is its scheme’s colours on a transparent ground, and not the other scheme’s', () =>
    rows.pipe(
      Effect.map((measured) => {
        expect(measured.length).toBe(22);
        expect(
          measured.filter(
            ({ own }) =>
              own.clear < TRANSPARENT_SHARE || own.least < EXACT_FLOOR || own.off > OFF_ALLOWANCE,
          ),
        ).toEqual([]);
        expect(measured.filter(({ other }) => other.least >= EXACT_FLOOR)).toEqual([]);
      }),
    ));
});
