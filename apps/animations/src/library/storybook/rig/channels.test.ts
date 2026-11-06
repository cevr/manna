import { describe, expect, it } from 'bun:test';
import { accentAt, IDLE, RIG_PARTS, RIG_REST, type RigClock, rigPoseAt } from './channels.ts';

/** cold-table's clock as the prototype reads it: 30 fps, "bottle" at 3.84 s, the lead's own breath period from 0. */
const CLOCK: RigClock = { fps: 30, stress: 3.84, period: 3.5784890907350926, from: 0 };

/** The 5 s window's frames. */
const TIMES = Array.from({ length: 150 }, (_, i) => (i + 0.2) / 30);

const poses = TIMES.map((t) => rigPoseAt(CLOCK, t));

const span = (xs: ReadonlyArray<number>) => Math.max(...xs) - Math.min(...xs);

/** The lag in frames (0 to 15) at which `child` best matches `parent` before it, as the acceptance reads it. */
const lagOf = (child: ReadonlyArray<number>, parent: ReadonlyArray<number>): number => {
  const centred = (xs: ReadonlyArray<number>) => {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    return xs.map((x) => x - mean);
  };
  const [a, b] = [centred(child), centred(parent)];
  const score = (k: number) => a.slice(k).reduce((sum, x, i) => sum + x * (b[i] ?? 0), 0);
  return Array.from({ length: 16 }, (_, k) => k).reduce(
    (best, k) => [best, k][Number(score(k) > score(best))] ?? best,
  );
};

const angles = (part: (typeof RIG_PARTS)[number]) => poses.map((p) => p[part].angle);

describe('the rig channels', () => {
  it('rest is every part still', () => {
    for (const part of RIG_PARTS)
      expect(RIG_REST[part]).toEqual({ angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 });
  });

  it('are a pure function of the time', () => {
    expect(rigPoseAt(CLOCK, 3.21)).toEqual(rigPoseAt(CLOCK, 3.21));
  });

  it('breathe the body 0.2 to 2 % on its period', () => {
    const breath = span(poses.map((p) => p.body.sy));
    expect(breath).toBeGreaterThanOrEqual(0.002);
    expect(breath).toBeLessThanOrEqual(0.02);
    expect(rigPoseAt(CLOCK, CLOCK.period).body.sy).toBeCloseTo(1, 9);
  });

  it('turn the head after the body, 2 to 6 frames late, never past 4 degrees', () => {
    const lag = lagOf(angles('head'), angles('body'));
    expect(lag).toBeGreaterThanOrEqual(2);
    expect(lag).toBeLessThanOrEqual(6);
    expect(Math.max(...angles('head').map(Math.abs))).toBeLessThanOrEqual(4);
  });

  it('sway the bottle hand at least 6 frames behind, and trail the cloth at least 3, clear of the bar of 2', () => {
    expect(lagOf(angles('armLeft'), angles('body'))).toBeGreaterThanOrEqual(6);
    expect(lagOf(angles('clothSash'), angles('body'))).toBeGreaterThanOrEqual(3);
  });

  it('peak the accent on the stressed word: the head fastest 6 frames before to 2 after', () => {
    const stress = TIMES.findIndex((t) => t >= CLOCK.stress);
    const head = angles('head');
    const speed = head.slice(1).map((x, i) => Math.abs(x - (head[i] ?? 0)));
    const window = speed.slice(stress - 30, stress + 30);
    const fastest = window.indexOf(Math.max(...window)) + stress - 30;
    expect(fastest).toBeGreaterThanOrEqual(stress - 6);
    expect(fastest).toBeLessThanOrEqual(stress + 2);
    expect(accentAt(CLOCK, CLOCK.stress - IDLE.accent.before / CLOCK.fps)).toBeCloseTo(1, 9);
    expect(accentAt(CLOCK, CLOCK.stress + 1)).toBeCloseTo(0, 9);
  });

  it('leave the hand on his knee still', () => {
    expect(span(angles('armRight'))).toBe(0);
  });
});
