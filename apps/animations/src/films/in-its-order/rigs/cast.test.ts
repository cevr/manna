// IIO's cast render table (`cast.ts` `CAST`) is the members' kept views: for
// each member `cold` casts, every view of every sheet his record keeps
// (`cast-sheet.json` `kept.<kind>.views`), no other, each in its kept box;
// every rig it draws, its own and those drawn with it, is an artboard of the
// film's figures file; and each view's rig is traced from a kept view of that
// sheet (`concept`), so `film match` holds it there in a scene too. A view the
// owner keeps later fails here until the table draws it.

import { describe, expect, test } from 'bun:test';
import LEAD_FEAST from '../../../library/cast/lead-feast/cast-sheet/cast-sheet.json' with { type: 'json' };
import * as LEAD from '../../../library/cast/lead-feast/rig/lead.ts';
import * as LEAD_SEATED from '../../../library/cast/lead-feast/rig/seated-traced.ts';
import { CAST, SHEETS } from './cast.ts';
import { ARTBOARDS } from './figures.ts';

type Box = readonly [number, number, number, number];

/** What of a record the table answers to: each kept sheet's views, by name and box. */
interface Kept {
  readonly kept: Readonly<
    Record<
      string,
      {
        readonly views: ReadonlyArray<{
          readonly name: string;
          readonly box: ReadonlyArray<number>;
        }>;
      }
    >
  >;
}

/** Each member `cold` casts, by his record. */
const RECORDS: Readonly<Record<keyof typeof CAST, Kept>> = { 'lead-feast': LEAD_FEAST };

/** A view of the table, as the test reads it. */
type View = (typeof CAST)['lead-feast']['turnaround']['front'];

describe("IIO's cast render table", () => {
  test('draws every kept view of each member, no other, each in its kept box, by a rig of the figures file traced from that sheet', () => {
    const artboards = new Set(Object.values(ARTBOARDS));
    expect(Object.keys(CAST).sort()).toEqual(Object.keys(RECORDS).sort());
    for (const [member, record] of Object.entries(RECORDS)) {
      const table: Readonly<Record<string, Readonly<Record<string, View>>>> =
        CAST[member as keyof typeof CAST];
      expect(Object.keys(table).sort()).toEqual(Object.keys(record.kept).sort());
      expect(Object.keys(SHEETS[member as keyof typeof SHEETS]).sort()).toEqual(
        Object.keys(record.kept).sort(),
      );
      for (const [kind, kept] of Object.entries(record.kept)) {
        const views = table[kind] ?? {};
        expect(Object.keys(views).sort()).toEqual(kept.views.map((v) => v.name).sort());
        const boxes = kept.views.map((v) => v.box.join(','));
        for (const v of kept.views) {
          const drawn: View | undefined = views[v.name];
          expect(drawn?.box).toEqual(v.box as Box);
          for (const rig of [drawn?.rig, ...(drawn?.with ?? []).map((w) => w.rig)])
            expect(artboards.has(rig?.source.artboard ?? '')).toBe(true);
          const concept = drawn?.rig.concept;
          expect([concept?.image, concept?.box.join(',')]).toEqual([
            { cast: member, sheet: kind },
            expect.any(String),
          ]);
          expect(boxes).toContain(drawn?.rig.concept?.box.join(',') ?? '');
        }
      }
    }
  });

  test('seated, his near hand is drawn at his chin as the sheet lays it, his raised sleeve turning about his elbow below it', () => {
    const arm = LEAD.leadFeastSeated.arms.near;
    expect(arm.pivot[1]).toBeGreaterThan(arm.hand[1] + 40);
    const seated = CAST['lead-feast'].poses['poses-3'];
    const scale = SHEETS['lead-feast'].poses.scale;
    const [hx, hy] = LEAD_SEATED.HAND_NEAR.at;
    const drawn = seated.with?.[1]?.at ?? [0, 0];
    expect(
      Math.hypot(drawn[0] - (hx - seated.at[0]) / scale, drawn[1] - (hy - seated.at[1]) / scale),
    ).toBeLessThan(4);
  });
});
