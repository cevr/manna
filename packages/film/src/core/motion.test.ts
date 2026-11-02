import { describe, expect, test } from 'bun:test';

import { type Track, act, blink, curve, idle, lag } from './motion.ts';

/** `f` sampled every `step` s over [from, to]. */
const sampled = (f: Track, from: number, to: number, step: number) => {
  const ts: number[] = [];
  const vs: number[] = [];
  const n = Math.round((to - from) / step);
  for (let i = 0; i <= n; i++) {
    const t = from + i * step;
    ts.push(t);
    vs.push(f(t));
  }
  return { ts, vs };
};

const valuesOf = (f: Track, from: number, to: number, step: number) =>
  sampled(f, from, to, step).vs;

const gaps = (ts: ReadonlyArray<number>): number[] => ts.slice(1).map((t, i) => t - ts[i]!);

const largest = (xs: ReadonlyArray<number>): number =>
  xs.reduce((m, x) => Math.max(m, x), -Infinity);
const smallest = (xs: ReadonlyArray<number>): number =>
  xs.reduce((m, x) => Math.min(m, x), Infinity);

/** The heights of `vs`'s local peaks. */
const peaks = (vs: ReadonlyArray<number>): number[] =>
  vs.filter((v, i) => i > 0 && i < vs.length - 1 && v > vs[i - 1]! && v >= vs[i + 1]!);

/** Pearson correlation of two series of one length. */
const correlation = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): number => {
  const mean = (xs: ReadonlyArray<number>) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(a);
  const mb = mean(b);
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += (a[i]! - ma) * (b[i]! - mb);
    aa += (a[i]! - ma) ** 2;
    bb += (b[i]! - mb) ** 2;
  }
  return ab / Math.sqrt(aa * bb);
};

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

const pairs = <A>(xs: ReadonlyArray<A>): Array<readonly [A, A]> =>
  xs.flatMap((a, i) => xs.slice(i + 1).map((b) => [a, b] as const));

describe('curve', () => {
  test('passes through every key and holds flat before the first and after the last', () => {
    const c = curve([
      [1, 0],
      [2, 10],
      [3, 4],
    ]);
    expect([0, 1, 2, 3, 9].map(c)).toEqual([0, 0, 10, 4, 4]);
  });

  test('holds between two equal keys and never swings past a key between keys', () => {
    // A Catmull-Rom curve through these keys (a held elbow, then a lift) sinks
    // about 1.2 degrees under the held 48 before the lift starts.
    const keys = [
      [0, 48],
      [6.9, 48],
      [7.08, 56],
      [7.5, -7],
      [7.78, 2.5],
      [8.05, 0],
    ] as const;
    const c = curve(keys);
    const held = valuesOf(c, 0, 6.9, 0.01);
    expect(Math.max(...held.map((v) => Math.abs(v - 48)))).toBeLessThan(1e-9);
    const outside = keys.slice(1).map(([t1, v1], k) => {
      const [t0, v0] = keys[k]!;
      const vs = valuesOf(c, t0, t1, (t1 - t0) / 200);
      return Math.max(Math.min(v0, v1) - smallest(vs), largest(vs) - Math.max(v0, v1));
    });
    expect(largest(outside)).toBeLessThan(1e-9);
  });

  test('runs smoothly through a key it passes and comes level at a key it turns on', () => {
    const c = curve([
      [0, 0],
      [1, 5],
      [2, 10],
      [3, 2],
    ]);
    const h = 1e-6;
    expect((c(1) - c(1 - h)) / h).toBeCloseTo((c(1 + h) - c(1)) / h, 3);
    expect((c(2 + h) - c(2 - h)) / (2 * h)).toBeCloseTo(0, 3);
  });
});

describe('act', () => {
  test('dips the other way before a move and passes its target before it settles', () => {
    const elbow = act(48, [{ at: 7, dur: 1, to: 0, anticipate: 0.15, overshoot: 0.1 }]);
    const { ts, vs } = sampled(elbow, 7, 8, 0.001);
    const high = largest(vs);
    const low = smallest(vs);
    expect(high).toBeCloseTo(48 + 0.15 * 48, 6);
    expect(low).toBeCloseTo(0 - 0.1 * 48, 6);
    expect(ts[vs.indexOf(high)]!).toBeLessThan(ts[vs.indexOf(low)]!);
    expect([6.5, 7, 8, 30].map(elbow)).toEqual([48, 48, 0, 0]);
  });

  test('a move with no anticipation or overshoot stays between where it starts and its target', () => {
    const head = act(0, [{ at: 2, dur: 0.5, to: -3 }]);
    const vs = valuesOf(head, 0, 4, 0.001);
    expect(largest(vs)).toBe(0);
    expect(smallest(vs)).toBe(-3);
  });

  test('each move starts from where the last one settled', () => {
    const head = act(0, [
      { at: 1, dur: 0.5, to: -3 },
      { at: 4, dur: 0.6, to: 5, anticipate: 0.2 },
    ]);
    expect([2, 4, 4.6, 9].map(head)).toEqual([-3, -3, 5, 5]);
    expect(smallest(valuesOf(head, 4, 4.6, 0.001))).toBeCloseTo(-3 - 0.2 * 8, 6);
  });

  test('a move cued before the last one settled waits for it', () => {
    const lean = act(0, [
      { at: 1, dur: 1, to: 10 },
      { at: 1.5, dur: 1, to: 0 },
    ]);
    expect([2, 3].map(lean)).toEqual([10, 0]);
    // The second move runs 2 to 3 s, not 1.5 to 2.5 s: halfway it is between its keys.
    expect(lean(2.5)).toBeCloseTo(5, 6);
  });
});

describe('lag', () => {
  test('a child bone makes its parent move the lag later, so it follows through after the parent stops', () => {
    const arm = act(0, [{ at: 1, dur: 0.6, to: 20, overshoot: 0.1 }]);
    const wrist = lag(arm, 0.08);
    const { ts, vs } = sampled(arm, 0, 3, 0.01);
    expect(largest(ts.map((t, i) => Math.abs(wrist(t + 0.08) - vs[i]!)))).toBeLessThan(1e-9);
    expect(arm(1.6)).toBe(20);
    expect(wrist(1.6)).not.toBeCloseTo(20, 3);
    expect(wrist(1.68)).toBeCloseTo(20, 9);
  });
});

describe('idle', () => {
  test('is a pure function of its seed and t', () => {
    const a = idle(3);
    const first = a(17.25);
    a(2);
    a(40.5);
    expect(a(17.25)).toEqual(first);
    expect(idle(3)(17.25)).toEqual(first);
  });

  /** Seed `seed`'s idle over [0, to], sampled every `step` s, one series a channel. */
  const channelsOf = (seed: number, to: number, step: number) => {
    const a = idle(seed);
    const { ts, vs } = sampled((t) => t, 0, to, step);
    const at = vs.map((t) => a(t));
    return {
      ts,
      breath: at.map((x) => x.breath),
      sway: at.map((x) => x.sway),
      tilt: at.map((x) => x.tilt),
      drift: at.map((x) => x.drift),
    };
  };

  /** The times a sampled series crosses zero going up. */
  const risesOf = (ts: ReadonlyArray<number>, vs: ReadonlyArray<number>): number[] =>
    ts.filter((_, i) => i > 0 && vs[i - 1]! < 0 && vs[i]! >= 0);

  const long = SEEDS.map((seed) => channelsOf(seed, 240, 0.01));

  test('tilts the head about 2 degrees each way, once every 4 to 5 s', () => {
    for (const { ts, tilt } of long) {
      const reach = largest(tilt.map(Math.abs));
      const swings = gaps(risesOf(ts, tilt));
      expect(reach).toBeGreaterThan(1.7);
      expect(reach).toBeLessThan(2.3);
      expect(swings.length).toBeGreaterThan(40);
      expect(smallest(swings)).toBeGreaterThanOrEqual(3.99);
      expect(largest(swings)).toBeLessThanOrEqual(5.01);
    }
  });

  test('breathes between -1 and 1, and its weight drifts slower than it breathes', () => {
    for (const { ts, breath, drift } of long) {
      expect(largest(breath.map(Math.abs))).toBeLessThanOrEqual(1);
      expect(largest(drift.map(Math.abs))).toBeLessThanOrEqual(1);
      const breaths = gaps(risesOf(ts, breath));
      const drifts = gaps(risesOf(ts, drift));
      expect(largest(breaths)).toBeLessThan(5);
      expect(drifts.length).toBeGreaterThan(10);
      expect(smallest(drifts)).toBeGreaterThan(largest(breaths) * 2);
    }
  });

  test('sways on two periods, so its swings differ in size', () => {
    for (const { sway } of long) {
      const swings = peaks(sway);
      const top = largest(swings);
      expect(top).toBeLessThanOrEqual(1.5);
      expect(top - smallest(swings)).toBeGreaterThan(0.2 * top);
    }
  });

  test('never moves its breath, sway, tilt and drift in step', () => {
    for (const { breath, sway, tilt, drift } of long) {
      const most = largest(
        pairs([breath, sway, tilt, drift]).map(([x, y]) => Math.abs(correlation(x, y))),
      );
      expect(most).toBeLessThan(0.25);
    }
  });

  test('gives each seed its own idle, none breathing in step with another', () => {
    expect(largest(pairs(long).map(([x, y]) => correlation(x.breath, y.breath)))).toBeLessThan(0.6);
    const apart = pairs(long).map(([x, y]) =>
      largest(x.tilt.slice(0, 3000).map((v, i) => Math.abs(v - y.tilt[i]!))),
    );
    expect(smallest(apart)).toBeGreaterThan(0.5);
  });
});

describe('blink', () => {
  /** Each blink of `track` wholly inside [from, to], sampled every `step` s: when the lids start, shut fully and are open again. */
  const blinksOf = (track: Track, from: number, to: number, step: number) => {
    const { ts, vs } = sampled(track, from, to, step);
    const out: Array<{ start: number; shut: number; open: number; depth: number }> = [];
    let i = 1;
    while (i < vs.length) {
      if (vs[i - 1] === 0 && vs[i]! > 0) {
        let j = i;
        let top = i;
        while (j < vs.length && vs[j]! > 0) {
          if (vs[j]! > vs[top]!) top = j;
          j++;
        }
        if (j < vs.length)
          out.push({ start: ts[i]!, shut: ts[top]!, open: ts[j]!, depth: vs[top]! });
        i = j;
      }
      i++;
    }
    return { out, vs };
  };

  /** Each blink of seed `seed`'s own. */
  const blinks = (seed: number, from: number, to: number, step: number) =>
    blinksOf(blink(seed), from, to, step);

  test('shuts the eyes in about 110 ms and opens them in about 190 ms', () => {
    const { out, vs } = blinks(5, 0, 30, 0.001);
    expect(out.length).toBeGreaterThan(5);
    expect(smallest(vs)).toBe(0);
    expect(largest(vs)).toBeLessThanOrEqual(1);
    expect(smallest(out.map((b) => b.depth))).toBeGreaterThan(0.99);
    const shutting = out.map((b) => b.shut - b.start);
    const opening = out.map((b) => b.open - b.shut);
    expect(smallest(shutting)).toBeGreaterThan(0.105);
    expect(largest(shutting)).toBeLessThan(0.115);
    expect(smallest(opening)).toBeGreaterThan(0.185);
    expect(largest(opening)).toBeLessThan(0.195);
  });

  test('blinks once every 3 to 4 s', () => {
    for (const seed of [1, 5, 9]) {
      const starts = blinks(seed, 0, 120, 0.002).out.map((b) => b.start);
      expect(starts.length).toBeGreaterThanOrEqual(29);
      expect(smallest(gaps(starts))).toBeGreaterThanOrEqual(2.99);
      expect(largest(gaps(starts))).toBeLessThanOrEqual(4.01);
    }
  });

  test('is a pure function of its seed and t', () => {
    const during = blinks(4, 0, 12, 0.001).out[0]!.shut - 0.05;
    const b = blink(4);
    const first = b(during);
    b(3);
    expect(first).toBeGreaterThan(0);
    expect(b(during)).toBe(first);
    expect(blink(4)(during)).toBe(first);
  });

  test('blinks at its own times for each seed, never in step with another', () => {
    const starts = SEEDS.map((seed) => blinks(seed, 0, 120, 0.005).out.map((b) => b.start));
    const shares = pairs(starts).map(
      ([a, b]) => a.filter((s) => b.some((o) => Math.abs(o - s) < 0.05)).length / a.length,
    );
    expect(largest(shares)).toBeLessThan(0.5);
  });

  test('blinks once more on each cue a second or more from its own blinks, and only there', () => {
    const own = blinks(3, 0, 30, 0.001).out.map((b) => b.start);
    // a cue midway between two of its blinks, and one 0.4 s after one of them
    const free = (own[2]! + own[3]!) / 2;
    const close = own[5]! + 0.4;
    const { out } = blinksOf(blink(3, [free, close]), 0, 30, 0.001);
    const starts = out.map((b) => b.start);
    const want = [...own, free].sort((a, b) => a - b);
    expect(starts.length).toBe(want.length);
    starts.forEach((s, k) => expect(Math.abs(s - want[k]!)).toBeLessThan(0.002));
    const cued = out.find((b) => Math.abs(b.start - free) < 0.002)!;
    expect(cued.depth).toBeGreaterThan(0.99);
    expect(cued.shut - cued.start).toBeGreaterThan(0.105);
    expect(cued.open - cued.shut).toBeGreaterThan(0.185);
  });
});
