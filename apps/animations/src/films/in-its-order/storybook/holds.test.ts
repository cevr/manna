import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Layer } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { filmFolder, shotsOf } from '../../../library/storybook/films.ts';
import { figuresOf } from '../../../library/storybook/shot.ts';
import { inItsOrder } from './index.ts';
import { SHEETS } from './sheets.ts';

// oxlint-disable-next-line effect/noAsyncFunction -- read once at module evaluation, so no case pays the read inside its time limit (film/no-lazy-test-fixture)
const placed = await Effect.runPromise(
  shotsOf(inItsOrder).pipe(
    Effect.provide([filmFolder.pipe(Layer.provide(BunServices.layer)), BunServices.layer]),
  ),
);

describe("In Its Order's storybook holds", () => {
  test('blinks every hold whose cell has a `<cell>Blink` key on its sheet: no such hold is still (critique 1, item 14)', () => {
    const still = placed.flatMap(({ shot }) =>
      figuresOf(shot).flatMap(({ figure: f }) => {
        const keys = SHEETS.find((s) => s.member === f.member && s.id === f.sheet)?.keys ?? [];
        return f.spans.flatMap((s) => {
          if (s._tag !== 'Hold' || (s.blink ?? s.cell) !== s.cell) return [];
          if (!keys.includes(`${s.cell}Blink`)) return [];
          return [`${shot.id} ${f.name} ${s.cell} at ${s.from.toFixed(2)} s`];
        });
      }),
    );
    expect(still).toEqual([]);
  });

  test('reads all nine shots', () => {
    expect(placed.length).toBe(9);
  });
});
