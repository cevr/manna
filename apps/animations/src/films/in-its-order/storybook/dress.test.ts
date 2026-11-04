import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import sharp from 'sharp';
import { hexOf, paintsOf } from '../../../library/storybook/sheet.ts';
import { SHEET_CELLS } from './cells.ts';
import { DINER_DRESS } from './shots/courtyard.ts';

/** How many opaque pixels of a cell hold each colour, by hex. */
const coloursOf = (png: string) =>
  Effect.map(
    Effect.promise(() => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })),
    ({ data, info }) => {
      const counts = new Map<string, number>();
      for (let q = 0; q < info.width * info.height; q++) {
        if ((data[q * 4 + 3] ?? 0) === 0) continue;
        const hex = hexOf([data[q * 4] ?? 0, data[q * 4 + 1] ?? 0, data[q * 4 + 2] ?? 0]);
        counts.set(hex, (counts.get(hex) ?? 0) + 1);
      }
      return counts;
    },
  );

/** Each dressed paint of diner `n` that is no paint of its palette, or that its neutral cell draws on under 100 px, named. */
const dressMisses = (n: number, dress: ReadonlyArray<{ readonly from: string }>) =>
  Effect.gen(function* () {
    const sheet = SHEET_CELLS.get(`filler-dressed/iio-diner-${n}`);
    const paints = new Set(
      paintsOf(sheet?.palette ?? { ink: '#000000', parts: [] }).map((p) => hexOf(p.rgb)),
    );
    const held = yield* coloursOf(sheet?.cells['neutral']?.png ?? '');
    return dress.flatMap((d) => [
      ...[`diner-${n} dresses ${d.from}, no paint of its palette`].filter(
        () => !paints.has(d.from),
      ),
      ...[`diner-${n} dresses ${d.from}, which its neutral cell holds under 100 px`].filter(
        () => (held.get(d.from) ?? 0) < 100,
      ),
    ]);
  });

describe('In Its Order act 1: the diners’ dress (critique 1, item 9; the owner’s O3)', () => {
  it.effect(
    'dresses only paints of the diner’s palette its cells draw, each over 100 px of its neutral cell',
    () =>
      Effect.gen(function* () {
        expect([...DINER_DRESS.keys()]).toEqual([1, 2]);
        const misses = yield* Effect.forEach([...DINER_DRESS], ([n, dress]) =>
          dressMisses(n, dress ?? []),
        );
        expect(misses.flat()).toEqual([]);
      }),
  );
});
