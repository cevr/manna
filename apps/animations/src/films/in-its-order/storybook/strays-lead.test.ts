import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { LEAD_SHEETS, straysOver } from './testing.ts';

describe("In Its Order's lead sheet strays", () => {
  it.effect(
    'holds every stray hair shade under 0.5 % of each cell’s opaque pixels, on the lead’s sheets (critique 1, items 15 and 16)',
    () =>
      Effect.gen(function* () {
        const { cells, over } = yield* straysOver((sheet) => sheet.startsWith(LEAD_SHEETS));
        expect(cells).toBeGreaterThan(0);
        expect(over).toEqual([]);
      }),
  );
});
