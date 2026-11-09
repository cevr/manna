/* oxlint-disable effect/noGlobals, effect/noTernary -- the property tallies its kinds in a plain map, names a wrong case by its values as JSON text, and writes R1's table and the shown opening as plain conditions apart from the code's. */

/**
 * The opening (R1 of hshomeroot) at its pure seam: `openingOf` over
 * generated garden views (none, `Unread`, and `Read` with 0 to 5 plants of
 * generated references) and both `opening` values, against R1's table
 * written out here apart from the code; and `shownOpening` over every pair
 * of openings, the decided one kept once decided.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import passage from 'virtual:heartseed-passage';

import { plantOf, type GardenView, type Plant } from '../garden';
import { openingOf, shownOpening, type Opening } from '../first/flow';
import { anyReference, recallOf } from '../test/field-model';
import { pickOf, random } from '../test/garden-model';

type Tally = Map<string, number>;

const bump = (tally: Tally, kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);

const T0 = Date.UTC(2026, 10, 9, 9);

/** A garden view as a launch's read may give it: none (the read under way), `Unread`, or `Read` with 0 to 5 plants. */
const viewOf = (next: () => number): Option.Option<GardenView> => {
  const kind = pickOf(next, ['none', 'unread', 'read', 'read', 'read'] as const);
  if (kind === 'none') return Option.none();
  if (kind === 'unread') return Option.some({ _tag: 'Unread' });
  const plants = new Map<string, Plant>();
  const count = Math.floor(next() * 6);
  for (let n = 0; n < count; n++) {
    const reference = anyReference(next, passage.reference);
    const grade = pickOf(next, [1, 2, 3, 4] as const);
    plants.set(reference, plantOf([recallOf(reference, T0 + n * 60_000, grade, 0)]));
  }
  return Option.some({ _tag: 'Read', plants });
};

/** R1's table: pending while the read runs, Today on an unread garden, the first minute on a read one with no plant, else the prop's screen. */
const R1 = (garden: Option.Option<GardenView>, opening: 'home' | 'today'): Opening => {
  if (Option.isNone(garden)) return 'pending';
  if (garden.value._tag === 'Unread') return 'today';
  return garden.value.plants.size === 0 ? 'first' : opening;
};

const OPENINGS: readonly Opening[] = ['pending', 'first', 'home', 'today'];

describe('the opening', () => {
  it('is R1 of the garden read and the prop over generated launches', () => {
    const next = random(4_101);
    const tally: Tally = new Map();
    const wrong: string[] = [];
    for (let run = 0; run < 400 && wrong.length < 3; run++) {
      const garden = viewOf(next);
      const opening = pickOf(next, ['home', 'today'] as const);
      const got = openingOf(garden, opening);
      const want = R1(garden, opening);
      if (got !== want)
        wrong.push(
          `run ${run}: ${got} where R1 has ${want} (${opening}, ${JSON.stringify(
            Option.map(garden, (view) =>
              view._tag === 'Read' ? [...view.plants.keys()] : view._tag,
            ),
          )})`,
        );
      bump(tally, `${want}:${opening}`);
      if (Option.exists(garden, (view) => view._tag === 'Read' && view.plants.size > 1))
        bump(tally, 'many plants');
    }
    expect(wrong).toEqual([]);
    for (const [kind, floor] of [
      ['pending:home', 20],
      ['pending:today', 20],
      ['today:home', 20],
      ['today:today', 20],
      ['first:home', 5],
      ['first:today', 5],
      ['home:home', 60],
      ['many plants', 60],
    ] as const)
      expect(tally.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(floor);
  });

  it('shows the decided opening once decided, and the read until then, over every pair', () => {
    const got = OPENINGS.flatMap((decided) =>
      OPENINGS.map((read) => `${decided}/${read}:${shownOpening(decided, read)}`),
    );
    const want = OPENINGS.flatMap((decided) =>
      OPENINGS.map((read) => `${decided}/${read}:${decided === 'pending' ? read : decided}`),
    );
    expect(got).toEqual(want);
  });
});
