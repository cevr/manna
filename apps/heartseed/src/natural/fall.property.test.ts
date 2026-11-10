/* oxlint-disable effect/noTernary, effect/noNullish -- the model and the generator write their choices as plain branches, and a curve with no voiced point has no window (undefined). */

/**
 * The Gentle fall (`fallOf`) against a model written here, over seeded
 * pitch curves shaped like Kokoro's Prosody output: unvoiced runs near 0 of
 * either sign, points of exactly 10 Hz, flats, ramps, dips, creak, final
 * rises, falls and tops, of 0 to 700 points. Its invariants are a second
 * oracle: the same length, no point raised, nothing outside the window
 * changed, non-increasing over the window, the window's last point at or
 * under the target, no point pushed under the pitch floor, and an
 * already-falling end pushed no lower than the target; each case kind has
 * a floor. Then the edges by hand (a final rise, a steep and a gentle fall,
 * the empty curve, no voiced point, a one-point window) and the 32 real
 * curves of `data/kokoro-curves.json` (Her and Him, Isaiah 41:10 and
 * Psalm 23:1-3, the pinned model's stages 1-4 on a Mac), each ending 2
 * semitones or more under its middle with no climb, and the measure the
 * probe reads (`fallMeasure`, `hasFallen`).
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import fixture from '../../data/kokoro-curves.json';

import {
  FALL_DROP,
  FALL_WINDOW,
  fallMeasure,
  fallOf,
  hasFallen,
  PITCH_FLOOR,
  VOICED_HZ,
} from './fall';

/** A seeded generator in [0, 1) (mulberry32). */
const random = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};
const pick = <A>(next: () => number, items: ReadonlyArray<A>): A =>
  items[Math.floor(next() * items.length)] as A;

const semitones = (hz: number, reference: number) => 12 * Math.log2(hz / reference);
const at = (curve: ReadonlyArray<number>, index: number) => curve[index] ?? Number.NaN;

interface Reach {
  readonly middle: number;
  readonly target: number;
  readonly window: ReadonlyArray<number>;
}

/** The rule written plainly: the median of the voiced points, the pitched points over the floor, the window of the last 36 of them. */
const reachOf = (f0: ReadonlyArray<number>): Reach | undefined => {
  const voiced = f0.filter((hz) => hz > 10).sort((a, b) => a - b);
  if (voiced.length === 0) return undefined;
  const half = voiced.length >> 1;
  const middle =
    voiced.length % 2 === 1 ? at(voiced, half) : (at(voiced, half - 1) + at(voiced, half)) / 2;
  const floor = middle * 2 ** (-6 / 12);
  const pitched: Array<number> = [];
  f0.forEach((hz, index) => {
    if (hz > 10 && hz >= floor) pitched.push(index);
  });
  const last = at(pitched, pitched.length - 1);
  return {
    middle,
    target: middle * 2 ** (-2 / 12),
    window: pitched.filter((index) => index > last - 36),
  };
};

/** The model: each window point the lower of its running minimum and the glide, even in semitones, from the window's first point to the target. */
const model = (f0: ReadonlyArray<number>): Array<number> => {
  const out = [...f0];
  const reach = reachOf(f0);
  if (reach === undefined) return out;
  const first = at(reach.window, 0);
  const last = at(reach.window, reach.window.length - 1);
  const from = at(f0, first);
  let held = Number.POSITIVE_INFINITY;
  for (const index of reach.window) {
    held = Math.min(held, at(f0, index));
    const part = last === first ? 1 : (index - first) / (last - first);
    out[index] = Math.min(held, from * (reach.target / from) ** part);
  }
  return out;
};

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

const TAIL_KINDS = ['rise', 'rise', 'fall', 'flat', 'creak', 'unvoiced', 'dip', 'ten', 'top'];
const BODY_KINDS = ['flat', 'rise', 'fall', 'unvoiced', 'dip', 'jitter', 'ramp'];

/** One point of a stretch of `kind`, `part` of the way through it. */
const pointOf = (next: () => number, kind: string, base: number, part: number, last: boolean) => {
  const jitter = 2 ** (((next() - 0.5) * 0.4) / 12);
  if (kind === 'unvoiced') return pick(next, [0, 0, 0.1, -0.1, 0.4, 3, 9.9]);
  if (kind === 'ten') return last ? 10 : base * jitter;
  if (kind === 'rise') return base * 2 ** ((part * (1 + next() * 0.2) * 9) / 12) * jitter;
  if (kind === 'fall') return base * 2 ** ((-part * 6) / 12) * jitter;
  if (kind === 'top') return last ? base * 2 : base * jitter;
  if (kind === 'dip') return next() < 0.15 ? base * (0.25 + next() * 0.3) : base * jitter;
  if (kind === 'creak') return part > 0.6 ? base * (0.3 + next() * 0.2) : base * jitter;
  if (kind === 'ramp') return base * (0.2 + 0.8 * part);
  return base * jitter;
};

/** A pitch curve of `n` points shaped like Prosody's, its last 48 points one of the endings Kokoro gives. */
const curveOf = (next: () => number, n: number): Array<number> => {
  const out: Array<number> = [];
  let base = 60 + next() * 260;
  while (out.length < n) {
    const left = n - out.length;
    const tail = left <= 48;
    const kind = pick(next, tail ? TAIL_KINDS : BODY_KINDS);
    const length = tail ? left : Math.min(left, 1 + Math.floor(next() * 40));
    for (let index = 0; index < length; index++) {
      const part = length === 1 ? 1 : index / (length - 1);
      out.push(pointOf(next, kind, base, part, index === length - 1));
    }
    if (kind === 'rise') base *= 2 ** (9 / 12);
    if (kind === 'fall') base *= 2 ** (-6 / 12);
    if (base < 50 || base > 420) base = 60 + next() * 260;
  }
  return out;
};

/** What a curve's window does after the rule, against the original's middle: its end, its last 50 ms (4 points) on average, its largest climb, and the points raised and lowered. */
const measured = (f0: ReadonlyArray<number>, out: ReadonlyArray<number>) => {
  const reach = reachOf(f0) ?? { middle: Number.NaN, target: Number.NaN, window: [] };
  let low = Number.POSITIVE_INFINITY;
  let climb = 0;
  for (const index of reach.window) {
    low = Math.min(low, at(out, index));
    climb = Math.max(climb, semitones(at(out, index), low));
  }
  const tail = reach.window.slice(-4).map((index) => at(out, index));
  return {
    end: semitones(at(out, at(reach.window, reach.window.length - 1)), reach.middle),
    tail: semitones(tail.reduce((a, b) => a + b, 0) / tail.length, reach.middle),
    climb,
    raised: out.filter((hz, index) => hz > at(f0, index)).length,
    lowered: out.filter((hz, index) => hz < at(f0, index)).length,
  };
};

/** What breaks the rule's invariants on one curve, by name. */
const brokenOf = (f0: ReadonlyArray<number>, out: ReadonlyArray<number>): Array<string> => {
  const wrong: Array<string> = [];
  if (out.length !== f0.length) wrong.push(`length ${out.length}`);
  if (out.some((hz, index) => hz > at(f0, index))) wrong.push('a point raised');
  const reach = reachOf(f0);
  if (reach === undefined) {
    if (out.some((hz, index) => hz !== f0[index])) wrong.push('no voiced point, yet changed');
    return wrong;
  }
  const inside = new Set(reach.window);
  if (out.some((hz, index) => !inside.has(index) && hz !== f0[index]))
    wrong.push('a point outside the window changed');
  const sent = reach.window.map((index) => at(out, index));
  if (sent.some((hz, k) => k > 0 && hz > at(sent, k - 1) * (1 + 1e-12)))
    wrong.push('rises inside its window');
  const last = at(reach.window, reach.window.length - 1);
  if (!(at(out, last) <= reach.target * (1 + 1e-12))) wrong.push('ends above the target');
  const floor = reach.middle * 2 ** (-6 / 12);
  if (
    reach.window.some((index) => !(at(out, index) >= Math.min(at(f0, index), floor) * (1 - 1e-12)))
  )
    wrong.push('a point pushed under the floor');
  const given = reach.window.map((index) => at(f0, index));
  if (given.every((hz, k) => k === 0 || hz <= at(given, k - 1))) {
    if (
      reach.window.some(
        (index) => !(at(out, index) >= Math.min(at(f0, index), reach.target) * (1 - 1e-12)),
      )
    )
      wrong.push('a falling end pushed under the target');
    if (!close(at(out, last), Math.min(at(f0, last), reach.target)))
      wrong.push('a falling end does not end at the lower of its own end and the target');
  }
  return wrong;
};

/** The case kinds the generated curves must reach, counted on one curve. */
const kindsOf = (f0: ReadonlyArray<number>): Array<string> => {
  const reach = reachOf(f0);
  if (reach === undefined) return ['no voiced point'];
  const given = reach.window.map((index) => at(f0, index));
  const first = at(reach.window, 0);
  const last = at(reach.window, reach.window.length - 1);
  const inside = new Set(reach.window);
  const kinds: Array<string> = [];
  if (at(given, given.length - 1) > at(given, 0)) kinds.push('rising end');
  if (given.every((hz, k) => k === 0 || hz <= at(given, k - 1))) kinds.push('falling end');
  if (reach.window.length === 1) kinds.push('one-point window');
  if (reach.window.length < FALL_WINDOW) kinds.push('short window');
  if (reach.window.length === FALL_WINDOW) kinds.push('full window');
  if (last < f0.length - 1) kinds.push('unvoiced tail');
  if (f0.slice(first, last + 1).some((hz, k) => hz > 10 && !inside.has(first + k)))
    kinds.push('dips inside the window');
  if (f0.includes(10)) kinds.push('a point of exactly 10 Hz');
  if (f0.some((hz) => hz < 0)) kinds.push('a negative point');
  return kinds;
};

interface Curve {
  readonly voice: string;
  readonly passage: string;
  readonly chunk: number;
  readonly frames: number;
  readonly f0: ReadonlyArray<number>;
}

const CURVES: ReadonlyArray<Curve> = fixture.curves;

describe('the Gentle fall', () => {
  it('names its numbers: 10 Hz voiced, a 6-semitone floor, a 36-point window, 2 semitones down', () => {
    expect({ VOICED_HZ, PITCH_FLOOR, FALL_WINDOW, FALL_DROP }).toEqual({
      VOICED_HZ: 10,
      PITCH_FLOOR: 6,
      FALL_WINDOW: 36,
      FALL_DROP: 2,
    });
  });

  it('falls each generated curve as the model does, keeping its invariants, with a floor on every kind', () => {
    const next = random(41_010);
    const cases: Array<Array<number>> = [];
    for (const n of [0, 1, 2, 3, 4, 35, 36, 37, 72, 73])
      for (let k = 0; k < 8; k++) cases.push(curveOf(next, n));
    for (let k = 0; k < 1_400; k++)
      cases.push(
        curveOf(
          next,
          next() < 0.85 ? 2 * (2 + Math.floor(next() * 300)) : 1 + Math.floor(next() * 700),
        ),
      );
    for (let k = 0; k < 20; k++)
      cases.push(
        Array.from({ length: 1 + Math.floor(next() * 80) }, () =>
          pick(next, [0, 0.2, -0.3, 10, 9.99]),
        ),
      );
    const wrong: Array<string> = [];
    const counts = new Map<string, number>();
    for (const f0 of cases) {
      const out = fallOf(f0);
      const want = model(f0);
      const name = `n=${f0.length} [..${f0
        .slice(-6)
        .map((hz) => hz.toFixed(1))
        .join(' ')}]`;
      if (out === f0) wrong.push(`${name}: its input array`);
      const off = want.findIndex((hz, index) => !close(out[index] ?? Number.NaN, hz));
      if (off >= 0) wrong.push(`${name}: point ${off} is ${out[off]}, the model's ${want[off]}`);
      for (const broken of brokenOf(f0, out)) wrong.push(`${name}: ${broken}`);
      for (const kind of kindsOf(f0)) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    expect(wrong.slice(0, 12)).toEqual([]);
    const floors = [
      'no voiced point',
      'rising end',
      'falling end',
      'one-point window',
      'short window',
      'full window',
      'unvoiced tail',
      'dips inside the window',
      'a point of exactly 10 Hz',
      'a negative point',
    ];
    expect(floors.filter((kind) => (counts.get(kind) ?? 0) < 6)).toEqual([]);
  });

  it('turns a final rise of 6 semitones into a fall of 2, with no climb and nothing raised', () => {
    const flat = Array.from({ length: 200 }, () => 200);
    const rise = [
      ...flat,
      ...Array.from({ length: 36 }, (_, k) => 200 * 2 ** ((6 * (k + 1)) / 36 / 12)),
    ];
    const out = fallOf(rise);
    const result = measured(rise, out);
    expect(out.length).toBe(rise.length);
    expect([result.raised, result.climb]).toEqual([0, 0]);
    expect(result.lowered).toBe(35);
    expect(result.tail).toBeLessThanOrEqual(-1.5);
    expect(result.end).toBeCloseTo(-2, 9);
    expect(out.slice(0, 200)).toEqual(flat);
  });

  it('pushes a gentle fall down to the target and a steep one no lower than its own end', () => {
    const flat = Array.from({ length: 200 }, () => 200);
    const steep = [
      ...flat,
      ...Array.from({ length: 36 }, (_, k) => 200 * 2 ** ((-4 * (k + 1)) / 36 / 12)),
    ];
    const kept = fallOf(steep);
    expect(at(kept, kept.length - 1)).toBeCloseTo(at(steep, steep.length - 1), 9);
    expect(brokenOf(steep, kept)).toEqual([]);
    const gentle = [
      ...flat,
      ...Array.from({ length: 36 }, (_, k) => 200 * 2 ** ((-1 * (k + 1)) / 36 / 12)),
    ];
    expect(measured(gentle, fallOf(gentle)).end).toBeCloseTo(-2, 9);
  });

  it('leaves the empty curve and a curve with no voiced point as given, and drops a one-point window to the target', () => {
    expect(fallOf([])).toEqual([]);
    expect(fallOf([0, 0.2, -0.1, 10])).toEqual([0, 0.2, -0.1, 10]);
    const one = fallOf([0, 150, 0]);
    expect(one.length).toBe(3);
    expect([one[0], one[2]]).toEqual([0, 0]);
    expect(at(one, 1)).toBeCloseTo(150 * 2 ** (-2 / 12), 9);
  });

  it('measures how a curve sent ends: its window’s end under the middle, its climb, and whether it fell', () => {
    const flat = Array.from({ length: 80 }, () => 200);
    const rise = [
      ...flat,
      ...Array.from({ length: 36 }, (_, k) => 200 * 2 ** ((6 * (k + 1)) / 36 / 12)),
    ];
    const before = Option.getOrThrow(fallMeasure(rise, rise));
    expect(before.end).toBeCloseTo(6, 9);
    expect(before.climb).toBeCloseTo((6 * 35) / 36, 9);
    expect(hasFallen(rise, rise)).toBe(false);
    const after = Option.getOrThrow(fallMeasure(rise, fallOf(rise)));
    expect(after.end).toBeCloseTo(-2, 9);
    expect(after.climb).toBe(0);
    expect(hasFallen(rise, fallOf(rise))).toBe(true);
    expect(Option.isNone(fallMeasure([0, 0], [0, 0]))).toBe(true);
    expect(hasFallen([0, 0], [0, 0])).toBe(false);
  });

  it('falls each of the 32 real curves 2 semitones or more under its middle, with no climb, nothing raised and its length kept', () => {
    expect(CURVES.length).toBe(32);
    const sets = new Set(CURVES.map((curve) => `${curve.voice} ${curve.passage}`));
    expect([...sets].toSorted()).toEqual([
      'af_heart Isaiah 41:10',
      'af_heart Psalm 23:1-3',
      'bm_george Isaiah 41:10',
      'bm_george Psalm 23:1-3',
    ]);
    const wrong: Array<string> = [];
    let climbed = 0;
    for (const curve of CURVES) {
      const name = `${curve.voice} ${curve.passage} chunk ${curve.chunk}`;
      if (curve.f0.length !== 2 * curve.frames) wrong.push(`${name}: ${curve.f0.length} points`);
      const before = measured(curve.f0, curve.f0);
      const out = fallOf(curve.f0);
      const after = measured(curve.f0, out);
      if (before.climb > 1) climbed += 1;
      if (out.length !== curve.f0.length) wrong.push(`${name}: length ${out.length}`);
      if (after.raised > 0) wrong.push(`${name}: ${after.raised} raised`);
      if (after.end > -2 + 1e-9) wrong.push(`${name}: ends at ${after.end.toFixed(2)}`);
      if (after.tail > -1.5) wrong.push(`${name}: last 50 ms at ${after.tail.toFixed(2)}`);
      if (after.climb > 0) wrong.push(`${name}: climbs ${after.climb.toFixed(2)}`);
      if (before.climb > 0 && after.lowered === 0)
        wrong.push(`${name}: climbed, yet nothing lowered`);
      if (!hasFallen(curve.f0, out)) wrong.push(`${name}: not fallen by its measure`);
    }
    expect(wrong).toEqual([]);
    expect(climbed).toBeGreaterThan(20);
  });
});
