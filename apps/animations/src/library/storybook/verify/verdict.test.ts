import { Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { Bar, BARS, CHECKS } from './bars.ts';
import { type Measured, one, unreadAt, verdictOf, verdictText, worstFor } from './verdict.ts';

/** A run where every check reads `value` once. */
const allRead = (value: number): Measured => ({
  palette: [one('palette', value)],
  pockets: [one('pockets', value)],
  'colour-step': [one('colour-step', value)],
  proportions: [one('proportions', value)],
  scale: [one('scale', value)],
  'one-sheet': [one('one-sheet', value)],
  light: [one('light', value)],
  'render-height': [one('render-height', value)],
  determinism: [one('determinism', value)],
});

/** Readings that pass every bar of the table. */
const PASSING: Measured = {
  palette: [one('a/front', 0.99), one('a/side', 1)],
  pockets: [one('2 cells', 0)],
  'colour-step': [one('a front -> side frame 3', 0.4)],
  proportions: [one('a head', 0.01)],
  scale: [one('g frame 1', 1.03), one('g frame 2', 0.98)],
  'one-sheet': [one('2 figures', 0)],
  light: [one('a frame 1', 0.99)],
  'render-height': [one('a over 9 frames', 0.01)],
  determinism: [one('8 renders, two launches', 0)],
};

describe('the bars table', () => {
  test('holds the nine checks in the order the verdict prints them, each proposed until the owner OKs it', () => {
    expect(BARS.map((b) => b.id)).toEqual([...CHECKS]);
    expect(CHECKS).toEqual([
      'palette',
      'pockets',
      'colour-step',
      'proportions',
      'scale',
      'one-sheet',
      'light',
      'render-height',
      'determinism',
    ]);
    expect(new Set(BARS.map((b) => b.source))).toEqual(new Set(['orchestrator-proposed']));
  });
});

describe('worstFor', () => {
  const a = { at: 'a', value: 0.9 };
  const b = { at: 'b', value: 1.06 };
  const c = { at: 'c', value: 0.5 };

  test('takes the largest at most, the smallest at least and the farthest from a target', () => {
    expect(worstFor(Bar.AtMost({ max: 1 }), [a, b, c])).toEqual(Option.some(b));
    expect(worstFor(Bar.AtLeast({ min: 1 }), [a, b, c])).toEqual(Option.some(c));
    expect(worstFor(Bar.Near({ target: 1, share: 0.05 }), [a, b, c])).toEqual(Option.some(c));
    expect(worstFor(Bar.AtMost({ max: 1 }), [])).toEqual(Option.none());
  });
});

describe('verdictOf', () => {
  test('passes every check whose worst reading meets its bar', () => {
    const v = verdictOf(BARS, PASSING);
    expect([v.passed, v.total]).toEqual([9, 9]);
    expect(v.checks.find((c) => c.id === 'scale')).toMatchObject({
      pass: true,
      value: '1.03',
      at: 'g frame 1',
      bar: '1 ±5%',
    });
  });

  test('fails a check over its bar, and names where', () => {
    const v = verdictOf(BARS, { ...PASSING, scale: [one('g frame 1', 1.06)] });
    expect(v.checks.find((c) => c.id === 'scale')).toMatchObject({
      pass: false,
      value: '1.06',
      at: 'g frame 1',
    });
    expect(v.passed).toBe(8);
  });

  test('fails as unread a check with any place unread, or with no reading at all', () => {
    const v = verdictOf(BARS, {
      ...PASSING,
      light: [one('a frame 1', 1), unreadAt('b frame 2: cut off')],
      'colour-step': [],
    });
    expect(v.checks.filter((c) => !c.pass).map((c) => [c.id, c.value, c.at])).toEqual([
      ['colour-step', 'unread', 'no reading'],
      ['light', 'unread', 'b frame 2: cut off'],
    ]);
  });

  test('judges every bar of the table: a run reading 0 everywhere fails the at-least and near bars only', () => {
    const v = verdictOf(BARS, allRead(0));
    expect(v.checks.filter((c) => !c.pass).map((c) => c.id)).toEqual(['palette', 'scale', 'light']);
  });
});

describe('verdictText', () => {
  test('opens PASS n/n pass, then one line per check, then one info line per figure', () => {
    const text = verdictText(verdictOf(BARS, PASSING), ['lead: lead-feast, not yet kept']);
    const lines = text.split('\n');
    expect(lines[0]).toBe('PASS 9/9 pass');
    expect(lines[2]).toBe('PASS palette 0.99 >= 0.98 (a/front; orchestrator-proposed)');
    expect(lines).toContain('INFO lead: lead-feast, not yet kept');
  });

  test('opens FAIL k/n pass when a check fails', () => {
    const text = verdictText(verdictOf(BARS, { ...PASSING, pockets: [one('x', 3)] }), []);
    expect(text.split('\n')[0]).toBe('FAIL 8/9 pass');
    expect(text).toContain('FAIL pockets 3 <= 0 (x; orchestrator-proposed)');
  });
});

describe('a shot with no figure', () => {
  const figureless = (determinism: number): Measured => ({
    palette: [],
    pockets: [],
    'colour-step': [],
    proportions: [],
    scale: [],
    'one-sheet': [],
    light: [],
    'render-height': [],
    determinism: [one('8 renders, two launches', determinism)],
  });

  test('passes every figure bar as no figure and is judged by determinism alone; with figures, the same empty readings fail unread', () => {
    const still = verdictOf(BARS, figureless(0), false);
    expect([still.passed, still.total]).toEqual([9, 9]);
    expect(still.checks.filter((c) => c.value === 'no figure').map((c) => c.id)).toEqual(
      CHECKS.filter((id) => id !== 'determinism'),
    );
    expect(verdictOf(BARS, figureless(2), false).checks.map((c) => c.pass)).toEqual([
      ...CHECKS.filter((id) => id !== 'determinism').map(() => true),
      false,
    ]);
    expect(verdictOf(BARS, figureless(0), true).passed).toBe(1);
  });

  test('never passes a figure bar that read something: a reading is judged as ever', () => {
    const v = verdictOf(BARS, { ...figureless(0), pockets: [one('x', 3)] }, false);
    expect(v.checks.find((c) => c.id === 'pockets')?.pass).toBe(false);
  });
});
