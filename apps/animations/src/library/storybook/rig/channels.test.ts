import { describe, expect, it } from 'bun:test';
import {
  beatAt,
  IDLE,
  idleOnly,
  RIG_PARTS,
  RIG_REST,
  type RigClock,
  type RigNumbers,
  type RigPart,
  rigPoseAt,
} from './channels.ts';

/** cold-table's clock as the prototype reads it: 30 fps, "bottle" at 3.84 s, the lead's own breath period from 0. */
const CLOCK: RigClock = { fps: 30, stress: 3.84, period: 3.5784890907350926, from: 0 };

/** The 5 s window's frames. */
const TIMES = Array.from({ length: 150 }, (_, i) => (i + 0.2) / 30);

/** The frame of the stressed word's onset. */
const STRESS = TIMES.findIndex((t) => t >= CLOCK.stress - 1e-6);

const span = (xs: ReadonlyArray<number>) => Math.max(...xs) - Math.min(...xs);

/** The lag in frames (0 to 40) at which `child` best matches `parent` before it: the Pearson correlation of their equal-length overlaps, the child `k` frames on. */
const lagOf = (child: ReadonlyArray<number>, parent: ReadonlyArray<number>): number => {
  const pearson = (a: ReadonlyArray<number>, b: ReadonlyArray<number>) => {
    const mean = (xs: ReadonlyArray<number>) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const [ma, mb] = [mean(a), mean(b)];
    const dot = a.reduce((s, x, i) => s + (x - ma) * ((b[i] ?? 0) - mb), 0);
    const norm = (xs: ReadonlyArray<number>, m: number) =>
      Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0));
    return dot / Math.max(1e-12, norm(a, ma) * norm(b, mb));
  };
  const score = (k: number) => pearson(child.slice(k), parent.slice(0, parent.length - k));
  return Array.from({ length: 41 }, (_, k) => k).reduce(
    (best, k) => [best, k][Number(score(k) > score(best))] ?? best,
  );
};

/** Each part's angle over the window, with numbers `n`, its idle alone or with the accent. */
const anglesOf = (n: RigNumbers, part: RigPart, accent: boolean) =>
  TIMES.map((t) => rigPoseAt(CLOCK, t, [idleOnly(n), n][Number(accent)] ?? n)[part].angle);

const poses = TIMES.map((t) => rigPoseAt(CLOCK, t));
const angles = (part: RigPart) => poses.map((p) => p[part].angle);

/** The numbers with every follower set `lag` frames late. */
const lagged = (lag: number): RigNumbers => ({
  ...IDLE,
  head: { ...IDLE.head, lag },
  hand: { ...IDLE.hand, lag },
  cloth: { ...IDLE.cloth, lag },
});

/** The frame at which `xs` is largest. */
const peakOf = (xs: ReadonlyArray<number>) => xs.indexOf(Math.max(...xs));

describe('the rig channels', () => {
  it('rest is every part still', () => {
    for (const part of RIG_PARTS)
      expect(RIG_REST[part]).toEqual({ angle: 0, sx: 1, sy: 1, dx: 0, dy: 0 });
  });

  it('are a pure function of the time', () => {
    expect(rigPoseAt(CLOCK, 3.21)).toEqual(rigPoseAt(CLOCK, 3.21));
  });

  it('breathe the torso 0.2 to 2 % on its period, the head and arm unstretched, the lap still', () => {
    const breath = span(poses.map((p) => p.body.sy));
    expect(breath).toBeGreaterThanOrEqual(0.002);
    expect(breath).toBeLessThanOrEqual(0.02);
    expect(rigPoseAt(CLOCK, CLOCK.period).body.sy).toBeCloseTo(1, 9);
    for (const p of poses) {
      expect(p.head.sy * p.body.sy).toBeCloseTo(1, 9);
      expect(p.armLeft.sy * p.body.sy).toBeCloseTo(1, 9);
      expect(p.lap).toEqual(RIG_REST.lap);
    }
  });

  it('measure every follow at the lag it is set to, 0 to 12 frames, within 1', () => {
    for (let lag = 0; lag <= 12; lag++) {
      const n = lagged(lag);
      const body = anglesOf(n, 'body', false);
      expect(Math.abs(lagOf(anglesOf(n, 'head', false), body) - lag)).toBeLessThanOrEqual(1);
      expect(Math.abs(lagOf(anglesOf(n, 'armLeft', false), body) - lag)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(lagOf(anglesOf(n, 'clothSleeve', true), anglesOf(n, 'armLeft', true)) - lag),
      ).toBeLessThanOrEqual(1);
    }
  });

  it('turn the head 2 to 6 frames after the body, never past 4 degrees', () => {
    const lag = lagOf(anglesOf(IDLE, 'head', false), anglesOf(IDLE, 'body', false));
    expect(lag).toBeGreaterThanOrEqual(2);
    expect(lag).toBeLessThanOrEqual(6);
    expect(Math.max(...angles('head').map(Math.abs))).toBeLessThanOrEqual(4);
  });

  it('sway the bottle hand at least 6 frames behind the body, and trail the sleeve at least 3 behind the arm', () => {
    expect(
      lagOf(anglesOf(IDLE, 'armLeft', false), anglesOf(IDLE, 'body', false)),
    ).toBeGreaterThanOrEqual(6);
    expect(lagOf(angles('clothSleeve'), angles('armLeft'))).toBeGreaterThanOrEqual(3);
  });

  it('peak the accent 0 to 2 frames before the stressed word, the head fastest 6 before to 2 after, the torso first and the head last', () => {
    const accent = (part: RigPart) => {
      const idle = anglesOf(IDLE, part, false);
      return angles(part).map((x, i) => Math.abs(x - (idle[i] ?? 0)));
    };
    const [body = 0, hand = 0, head = 0] = [accent('body'), accent('armLeft'), accent('head')].map(
      peakOf,
    );
    for (const [part, peak] of [
      ['armLeft', hand],
      ['head', head],
    ] as const) {
      const xs = accent(part);
      expect((xs[peak] ?? 0) - Math.max(xs[peak - 1] ?? 0, xs[peak + 1] ?? 0)).toBeGreaterThan(
        0.01,
      );
    }
    expect(head).toBeGreaterThanOrEqual(STRESS - 2);
    expect(head).toBeLessThanOrEqual(STRESS);
    expect(hand).toBeGreaterThanOrEqual(STRESS - 2);
    expect(hand).toBeLessThanOrEqual(STRESS);
    expect(body).toBeLessThan(hand);
    expect(hand).toBeLessThanOrEqual(head);
    const h = angles('head');
    const speed = h.slice(1).map((x, i) => Math.abs(x - (h[i] ?? 0)));
    const fastest = peakOf(speed.slice(STRESS - 30, STRESS + 30)) + STRESS - 30;
    expect(fastest).toBeGreaterThanOrEqual(STRESS - 6);
    expect(fastest).toBeLessThanOrEqual(STRESS + 2);
  });

  it('turn the other way before the beat rises, and settle back to the idle', () => {
    const beat = IDLE.accent.head;
    const before = TIMES.map((t) => beatAt(IDLE, CLOCK, beat, t)).slice(STRESS - 12, STRESS - 4);
    expect(Math.min(...before)).toBeLessThan(-beat.anticipate / 2);
    expect(beatAt(IDLE, CLOCK, beat, CLOCK.stress + 1.2)).toBeCloseTo(0, 9);
  });

  it('leave the hand on his knee still', () => {
    expect(span(angles('armRight'))).toBe(0);
  });
});
