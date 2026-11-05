import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Layer, Result } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import sharp from 'sharp';
import { filmFolder, shotsOf } from '../../../library/storybook/films.ts';
import { blinkOf, paintsOf } from '../../../library/storybook/sheet.ts';
import { figuresOf } from '../../../library/storybook/shot.ts';
import { SHEET_CELLS } from './cells.ts';
import { inItsOrder } from './index.ts';
import { SHEETS } from './sheets.ts';

// oxlint-disable-next-line effect/noAsyncFunction -- read once at module evaluation, so no case pays the read inside its time limit (film/no-lazy-test-fixture)
const placed = await Effect.runPromise(
  shotsOf(inItsOrder).pipe(
    Effect.provide([filmFolder.pipe(Layer.provide(BunServices.layer)), BunServices.layer]),
  ),
);

/** The longest a figure may show one drawing with the same eyes (the act's acceptance, `ALIVE`). */
const ALIVE = 4.6;

/**
 * The cells whose open eyes are lids, `<sheet> <cell>`: `blinkOf` refuses
 * them (arcs with nothing open to close), so a hold of one stays still and
 * changes key within `ALIVE` instead (compaction-3 ruling; a blink never
 * swaps the whole drawing, round 3, M1).
 */
const LIDDED = new Set(['lead-feast/iio-table down', 'lead-feast/iio-close down']);

/** Every hold of the film that shows no blink though its sheet has a `<cell>Blink` key. */
const stills = placed.flatMap(({ shot }) =>
  figuresOf(shot).flatMap(({ figure: f }) => {
    const keys = SHEETS.find((s) => s.member === f.member && s.id === f.sheet)?.keys ?? [];
    return f.spans.flatMap((s) => {
      if (s._tag !== 'Hold' || (s.blink ?? s.cell) !== s.cell) return [];
      if (!keys.includes(`${s.cell}Blink`)) return [];
      return [
        {
          cell: `${f.member}/${f.sheet} ${s.cell}`,
          at: `${shot.id} ${f.name} ${s.cell} at ${s.from.toFixed(2)} s`,
          long: s.to - s.from,
        },
      ];
    });
  }),
);

/** A cell's pixels as the split stored them. */
const rasterOf = (png: string) =>
  Effect.map(
    Effect.promise(() => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })),
    ({ data, info }) => ({ width: info.width, height: info.height, rgba: new Uint8Array(data) }),
  );

describe("In Its Order's storybook holds", () => {
  test('blinks every hold whose cell has a `<cell>Blink` key on its sheet, but a lidded cell’s, which changes key within 4.6 s (critique 1, item 14; round 3, M1)', () => {
    expect(stills.filter((s) => !LIDDED.has(s.cell)).map((s) => s.at)).toEqual([]);
    expect(stills.filter((s) => LIDDED.has(s.cell) && s.long > ALIVE).map((s) => s.at)).toEqual([]);
  });

  it.effect('refuses a pasted blink on every lidded cell, so none is lidded by choice', () =>
    Effect.gen(function* () {
      const pasted = yield* Effect.forEach([...LIDDED], (name) =>
        Effect.gen(function* () {
          const [sheet = '', cell = ''] = name.split(' ');
          const s = SHEET_CELLS.get(sheet);
          const [open, shut] = [s?.cells[cell], s?.cells[`${cell}Blink`]];
          if (!s || !open || !shut) return [`${name}: no cell or blink key`];
          const built = blinkOf(
            yield* rasterOf(open.png),
            yield* rasterOf(shut.png),
            paintsOf(s.palette),
          );
          return [`${name}: blinks`].filter(() => Result.isSuccess(built));
        }),
      );
      expect(pasted.flat()).toEqual([]);
    }),
  );

  test('reads all nine shots', () => {
    expect(placed.length).toBe(9);
  });
});
