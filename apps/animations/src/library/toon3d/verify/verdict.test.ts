import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { PART } from '../figure.ts';
import { BARS, MEASURES, STAGES } from './bars.ts';
import { bendAngles, FULL_PLAN, turnYaws } from './pipeline.ts';
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
    parts: [{ part: PART.body, px: 500, median: 1.5 }],
    flatness: [{ part: PART.body, px: 500, share: 0.99, blobs: 1, raggedness: 3 }],
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

  test('every measure is read by some bar', () => {
    expect(new Set(BARS.map((b) => b.measure))).toEqual(new Set(MEASURES));
  });
});

describe('verdictOf', () => {
  test('a run meeting every bar passes n/n', () => {
    const v = verdictOf(BARS, clean);
    expect(v.checks.filter((c) => !c.pass)).toEqual([]);
    expect(verdictText(v).split('\n')[0]).toBe(`PASS ${BARS.length}/${BARS.length}`);
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
    expect(verdictText(v).split('\n')[0]).toBe(`FAIL ${BARS.length - 1}/${BARS.length}`);
    expect(verdictText(v)).toContain('FAIL silhouette geometry 0.9 >= 0.95 (back;');
  });

  test("the sleeve's drift is read from frame 0 on each bone", () => {
    const bend = [frame(0), frame(1, { fore: Option.some(30) }), frame(2)];
    const sleeve = verdictOf(BARS, { ...clean, bend }).checks.find((c) => c.id === 'bend-sleeve');
    expect(sleeve).toMatchObject({ pass: false, at: 'forearm', value: '0.167' });
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
