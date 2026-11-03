import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { PART } from '../figure.ts';
import { BARS, MEASURES, STAGES } from './bars.ts';
import { bendAngles, FULL_PLAN, proportionRows, turnYaws } from './pipeline.ts';
import { READERS, verdictOf, verdictText, type FrameMeasured, type Measured } from './verdict.ts';

const frame = (k: number, over: Partial<FrameMeasured> = {}): FrameMeasured => ({
  frame: k,
  ink: 8,
  doubled: 0,
  tears: 0,
  upper: Option.some(40),
  fore: Option.some(36),
  ...over,
});

/** A run where every check meets its bar. */
const clean: Measured = {
  renders: { compared: 4, differing: [] },
  views: FULL_PLAN.views.map((view) => ({
    view,
    iou: 0.97,
    probes: [{ at: `${view} body base #0`, read: Result.succeed(1.5) }],
    flatness: [
      { part: PART.body, px: 500, share: 0.99, blobs: 1, raggedness: 3 },
      { part: PART.hair, px: 400, share: 0.99, blobs: 6, raggedness: 3 },
    ],
    keptHairBlobs: 6,
    inkWidth: 8,
    keptInkWidth: 8,
    inkDeltaE: Option.some(2),
  })),
  frontRows: Option.some({ flagged: 2, compared: 20, names: ['a', 'b'] }),
  face: Option.some(1.5),
  bend: [0, 1, 2].map((k) => frame(k)),
  turn: [0, 1].map((k) => frame(k)),
};

/** A run that read nothing. */
const empty: Measured = {
  renders: { compared: 0, differing: [] },
  views: [],
  frontRows: Option.none(),
  face: Option.none(),
  bend: [],
  turn: [],
};

describe('the bars table', () => {
  test('every bar has a measure, a known stage and its own id', () => {
    for (const row of BARS) {
      expect(MEASURES).toContain(row.measure);
      expect(STAGES).toContain(row.stage);
      expect(Object.keys(READERS)).toContain(row.measure);
    }
    expect(new Set(BARS.map((b) => b.id)).size).toBe(BARS.length);
  });

  test('every bar is the owner’s, approved 2026-11-03', () => {
    expect(BARS.filter((b) => b.source !== 'owner').map((b) => b.id)).toEqual([]);
  });

  test('every measure is read by some bar', () => {
    expect(new Set(BARS.map((b) => b.measure))).toEqual(new Set(MEASURES));
  });
});

describe('verdictOf', () => {
  test('a run meeting every bar passes n/n', () => {
    const v = verdictOf(BARS, clean);
    expect(v.checks.filter((c) => !c.pass)).toEqual([]);
    expect(verdictText(v).split('\n')[0]).toBe(`PASS ${BARS.length}/${BARS.length} pass`);
  });

  test('a measure with no reading fails its check as unread', () => {
    const v = verdictOf(BARS, empty);
    const unread = v.checks.filter((c) => c.value === 'unread').map((c) => c.id);
    expect(unread).toContain('silhouette');
    expect(unread).toContain('face');
    expect(unread).toContain('proportions');
    expect(v.checks.filter((c) => c.value === 'unread').every((c) => !c.pass)).toBe(true);
  });

  test('the worst reading is judged, and the verdict names where it was read', () => {
    const views = clean.views.map((v) => {
      if (v.view === 'back') return { ...v, iou: 0.9 };
      return v;
    });
    const v = verdictOf(BARS, { ...clean, views });
    const silhouette = v.checks.find((c) => c.id === 'silhouette');
    expect(silhouette).toMatchObject({ pass: false, value: '0.9', at: 'back' });
    expect(verdictText(v).split('\n')[0]).toBe(`FAIL ${BARS.length - 1}/${BARS.length} pass`);
    expect(verdictText(v)).toContain('FAIL silhouette geometry 0.9 >= 0.95 (back;');
  });

  test("the sleeve's drift is read from frame 0 on each bone", () => {
    const bend = [frame(0), frame(1, { fore: Option.some(30) }), frame(2)];
    const sleeve = verdictOf(BARS, { ...clean, bend }).checks.find((c) => c.id === 'bend-sleeve');
    expect(sleeve).toMatchObject({ pass: false, at: 'forearm', value: '0.167' });
  });

  const sleeveOf = (bend: ReadonlyArray<FrameMeasured>) =>
    verdictOf(BARS, { ...clean, bend }).checks.find((c) => c.id === 'bend-sleeve');

  test('a frame whose forearm is unread fails the sleeve as unread, though every read frame holds its width', () => {
    const bend = Array.from({ length: 96 }, (_, k) => {
      if (k === 48) return frame(k, { fore: Option.none() });
      return frame(k);
    });
    expect(sleeveOf(bend)).toMatchObject({ pass: false, value: 'unread', at: 'forearm frame 48' });
  });

  test('a bend whose forearm is never read fails the sleeve as unread, though the upper arm holds', () => {
    const bend = [0, 1, 2].map((k) => frame(k, { fore: Option.none() }));
    expect(sleeveOf(bend)).toMatchObject({ pass: false, value: 'unread', at: 'forearm frame 0' });
  });

  test("an unread frame 0 leaves the sleeve's drift with no reference: it fails as unread", () => {
    const bend = [frame(0, { upper: Option.none() }), frame(1), frame(2)];
    expect(sleeveOf(bend)).toMatchObject({ pass: false, value: 'unread', at: 'upper arm frame 0' });
  });

  test('a bend whose frame 0 reads no ink has no outline to drift from: it fails as unread, not 0', () => {
    const bend = [frame(0, { ink: 0 }), frame(1), frame(2)];
    expect(
      verdictOf(BARS, { ...clean, bend }).checks.find((c) => c.id === 'bend-outline'),
    ).toMatchObject({ pass: false, value: 'unread' });
  });

  test('one view whose ink colour is unread fails ink-colour as unread at that view', () => {
    const views = clean.views.map((v) => {
      if (v.view === 'back') return { ...v, inkDeltaE: Option.none<number>() };
      return v;
    });
    expect(
      verdictOf(BARS, { ...clean, views }).checks.find((c) => c.id === 'ink-colour'),
    ).toMatchObject({ pass: false, value: 'unread', at: 'back' });
  });

  test("the hair may have as many shade blobs as the kept view's hair, and one more fails; other parts keep <= 2", () => {
    const withHair = (blobs: number): Measured => ({
      ...clean,
      views: clean.views.map((v) => ({
        ...v,
        flatness: v.flatness.map((f) => {
          if (f.part === PART.hair) return { ...f, blobs };
          return f;
        }),
      })),
    });
    const hair = (blobs: number) =>
      verdictOf(BARS, withHair(blobs)).checks.find((c) => c.id === 'flat-blobs-hair');
    expect(hair(6)).toMatchObject({ pass: true, value: '0' });
    expect(hair(7)).toMatchObject({ pass: false, value: '1' });
    expect(verdictOf(BARS, withHair(7)).checks.find((c) => c.id === 'flat-blobs')).toMatchObject({
      pass: true,
      value: '1',
    });
  });

  test('bend-doubled reads the doubled px the motion adds over frame 0, not the parallel lines the rest frame already draws', () => {
    const bend = [frame(0, { doubled: 90 }), frame(1, { doubled: 105 }), frame(2, { doubled: 60 })];
    const ok = verdictOf(BARS, { ...clean, bend }).checks.find((c) => c.id === 'bend-doubled');
    expect(ok).toMatchObject({ pass: true, at: 'frame 1', value: '15' });
    const more = [...bend, frame(3, { doubled: 111 })];
    const worse = verdictOf(BARS, { ...clean, bend: more }).checks.find(
      (c) => c.id === 'bend-doubled',
    );
    expect(worse).toMatchObject({ pass: false, at: 'frame 3', value: '21' });
  });

  test('a render that differs between launches fails determinism', () => {
    const v = verdictOf(BARS, {
      ...clean,
      renders: { compared: 4, differing: ['views/front.png'] },
    });
    expect(v.checks.find((c) => c.id === 'determinism')).toMatchObject({ pass: false, value: '1' });
  });
});

describe('the motion plan', () => {
  test('the bend runs 0 -> 110 -> 0 over 96 frames and the turn 0 -> -pi/2 over 72', () => {
    const bend = bendAngles(96);
    expect(bend).toHaveLength(96);
    expect(bend[0]).toBe(0);
    expect(Math.max(...bend)).toBeCloseTo(110, 9);
    expect(bend[48]).toBeCloseTo(110, 9);
    const turn = turnYaws(72);
    expect(turn).toHaveLength(72);
    expect(turn[0]).toBeCloseTo(0, 9);
    expect(turn[71]).toBeCloseTo(-Math.PI / 2, 9);
  });
});

describe('the proportion rows', () => {
  test('count only the ratio rows: a flagged silhouette gap, shade or facing row is not a proportion', () => {
    const rows = [
      { name: 'head height', unit: 'ratio', flagged: true },
      { name: 'eye spacing', unit: 'ratio', flagged: false },
      { name: 'shoulder width', unit: 'ratio', flagged: false },
      { name: 'neck gap', unit: 'rule', flagged: true },
      { name: 'arm gap', unit: 'rule', flagged: true },
      { name: 'head shade step', unit: 'value', flagged: true },
      { name: 'facing', unit: 'degrees', flagged: true },
    ] as const;
    expect(proportionRows(rows)).toEqual({ flagged: 1, compared: 3, names: ['head height'] });
  });
});
