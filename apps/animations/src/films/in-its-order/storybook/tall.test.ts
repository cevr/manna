import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import sharp from 'sharp';
import { SHEET_CELLS } from './cells.ts';
import { TALL } from './kit.ts';

/** A cell's first row with any pixel that is not clear. */
const topOf = (png: string) =>
  Effect.promise(() => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).pipe(
    Effect.map(({ data, info }) =>
      Math.floor(data.findIndex((v, i) => i % 4 === 3 && v > 0) / (info.width * 4)),
    ),
  );

/** Each sheet's crown-to-soles read on its first cell, by `<member>/<sheet>`. */
const measured = Effect.forEach(
  [...SHEET_CELLS],
  ([name, sheet]) => {
    const [first] = Object.values(sheet.cells);
    if (!first) return Effect.succeed([name, 0] as const);
    return Effect.map(topOf(first.png), (top) => [name, first.ay - top] as const);
  },
  { concurrency: 'unbounded' },
);

describe('In Its Order act 1: each figure placed by its crown', () => {
  it.effect(
    'holds every sheet’s crown-to-soles to its first cell: its soles’ row less its first inked row',
    () =>
      Effect.gen(function* () {
        const read = yield* measured;
        expect([...TALL.keys()].toSorted()).toEqual(read.map(([name]) => name).toSorted());
        expect(read.filter(([name, tall]) => TALL.get(name) !== tall)).toEqual([]);
      }),
  );
});
