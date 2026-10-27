// The fit rows' `slivers` over the strip's domain (`core/fit-rows.ts`): a
// strip of paper 2 px thick or less and 6 px long or more is a sliver,
// against the figure's line or cut loose of it, upright or across; a thicker
// or a shorter one is not (off the figure, the ground's grain). Synthetic
// figures (`fixtures/fit/figure.ts`), too many for the unit budget.

import { describe, expect, test } from 'bun:test';
import { Boolean as Bool } from 'effect';
import { fitRows } from './fit-rows.ts';
import { type Box, RENDER_GROUND, SHEET_GROUND, paint } from './fixtures/fit/figure.ts';

const SHEET = paint({ ground: SHEET_GROUND });

/** Where a strip `thick` across and `long` along lies: against the body's right line or 5 px off it (upright), against its foot's line or 5 px under it (across). */
const PLACES = {
  'upright, against the line': (t: number, l: number): Box => [47, 47 + t, 40, 40 + l],
  'upright, cut loose': (t: number, l: number): Box => [52, 52 + t, 40, 40 + l],
  'across, against the line': (t: number, l: number): Box => [20, 20 + l, 85, 85 + t],
  'across, cut loose': (t: number, l: number): Box => [10, 10 + l, 90, 90 + t],
} as const;

describe('fitRows slivers', () => {
  test('a strip 2 px thick or less and 6 px long or more is a sliver, wherever it lies; any other is not', () => {
    const wrong: string[] = [];
    for (const [place, box] of Object.entries(PLACES))
      for (const thick of [1, 2, 3])
        for (const long of [4, 5, 6, 7, 10, 11, 16, 20]) {
          const rows = fitRows(SHEET, paint({ ground: RENDER_GROUND, strips: [box(thick, long)] }));
          const sliver = thick <= 2 && long >= 6;
          const row = rows.find((r) => r.name === 'slivers');
          const want = Bool.match(sliver, { onTrue: () => thick * long, onFalse: () => 0 });
          if (row?.value !== want || row.pass === sliver)
            wrong.push(`${place} ${thick}×${long}: ${row?.value} (want ${want})`);
        }
    expect(wrong).toEqual([]);
  });
});
