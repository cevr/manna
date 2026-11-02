// The man's head keys (`heads.ts`) against his poses-1 part sheet: each names
// a part his sheet holds and is the sheet's size, as the loader asks before it
// un-mattes a key in place of its part, and each holds his head down to his
// head part's lowest row and no lower, so the drape below his chin stays on
// his torso, as the feast mother's veil does, with the drape's two outlines
// ending where his head part's end, so they run on into his torso's. Each case
// decodes his sheets, so they run in the slow suite.

import * as BunServices from '@effect/platform-bun/BunServices';
import { type Raster, decodePng } from '@manna/film/tools';
import { Array as Arr, Effect, FileSystem, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { HEADED } from './heads.ts';

/** The PNG at `png`, decoded. */
const decoded = (png: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* Effect.fromResult(decodePng(yield* fs.readFile(png)));
  });

/** The lowest row of `r` holding a pixel (alpha above 0), or -1 for none. */
const lowestRow = (r: Raster) => {
  for (let y = r.height - 1; y >= 0; y--)
    for (let x = 0; x < r.width; x++) if (r.rgba[(y * r.width + x) * 4 + 3]! > 0) return y;
  return -1;
};

/**
 * Row `y`'s ink runs in `r`, each `[first, last]`, left to right: the px it
 * holds (alpha above 0) darker than luminance 110, his outlines and none of
 * his cloth or skin.
 */
const inkRuns = (r: Raster, y: number) => {
  const runs: Array<readonly [number, number]> = [];
  let start = -1;
  for (let x = 0; x <= r.width; x++) {
    const i = (y * r.width + x) * 4;
    const ink =
      x < r.width &&
      r.rgba[i + 3]! > 0 &&
      0.299 * r.rgba[i]! + 0.587 * r.rgba[i + 1]! + 0.114 * r.rgba[i + 2]! < 110;
    if (ink && start < 0) start = x;
    if (!ink && start >= 0) {
      runs.push([start, x - 1]);
      start = -1;
    }
  }
  return runs;
};

/** The ends of row `y`'s outermost ink runs in `r`, his drape's outlines: `[left's first, left's last, right's first, right's last]`. */
const outlinesOf = (r: Raster, y: number) => {
  const runs = inkRuns(r, y);
  return [...(runs[0] ?? [-1, -1]), ...(runs.at(-1) ?? [-1, -1])];
};

/** His poses-1 head part's PNG. */
const HEAD = Option.getOrThrow(Arr.findFirst(HEADED.parts, (p) => p.name === 'head')).png;

describe("the man's head keys", () => {
  it.effect.layer(BunServices.layer)(
    "each stands in for a part his poses-1 sheet holds, at the sheet's size",
    () =>
      Effect.gen(function* () {
        const names = HEADED.parts.map((p) => p.name);
        for (const d of HEADED.drawings) {
          const key = yield* decoded(d.png);
          expect([d.name, names.includes(d.part), key.width, key.height]).toEqual([
            d.name,
            true,
            ...HEADED.size,
          ]);
        }
      }),
  );

  it.effect.layer(BunServices.layer)(
    "each holds his head down to his head part's lowest row, none of the drape below his chin",
    () =>
      Effect.gen(function* () {
        const head = lowestRow(yield* decoded(HEAD));
        expect(head).toBeGreaterThan(0);
        for (const d of HEADED.drawings)
          expect([d.name, lowestRow(yield* decoded(d.png))]).toEqual([d.name, head]);
      }),
  );

  it.effect.layer(BunServices.layer)(
    "each one's drape outlines end within 1 px of his head part's on its lowest row, so they meet his torso's",
    () =>
      Effect.gen(function* () {
        const head = yield* decoded(HEAD);
        const chin = lowestRow(head);
        const ends = outlinesOf(head, chin);
        expect(ends.every((x) => x >= 0)).toBe(true);
        for (const d of HEADED.drawings) {
          const key = outlinesOf(yield* decoded(d.png), chin);
          const off = Math.max(...key.map((x, i) => Math.abs(x - ends[i]!)));
          expect([d.name, off]).toEqual([d.name, Math.min(off, 1)]);
        }
      }),
  );
});
