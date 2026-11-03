import { describe, expect, test } from 'bun:test';
import { burst, cycle, fly, flyV, stream } from './particles.ts';

/** One call an emitter makes: the index, age and life, then two draws of its rng. */
type Call = readonly [i: number, age: number, life: number, r0: number, r1: number];

const close = (a: readonly number[], b: readonly number[], digits = 9) => {
  expect(a.length).toBe(b.length);
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i] ?? Number.NaN, digits));
};

describe('fly', () => {
  test('without drag it is the ballistic arc, and its velocity the derivative', () => {
    const [x, y, vx, vy, g] = [10, 20, 30, -40, 980];
    for (const t of [0, 0.1, 0.5, 2]) {
      close(fly(x, y, vx, vy, t, g), [x + vx * t, y + vy * t + 0.5 * g * t * t]);
      close(flyV(vx, vy, t, g), [vx, vy + g * t]);
    }
    close(fly(x, y, vx, vy, 1), [x + vx, y + vy]);
  });

  test('with drag it is the closed form, approaches terminal velocity, and goes to the arc as drag goes to 0', () => {
    const [x, y, vx, vy, g, k] = [0, 0, 100, -50, 400, 2];
    const t = 0.7;
    const f = (1 - Math.exp(-k * t)) / k;
    close(fly(x, y, vx, vy, t, g, k), [vx * f, (g / k) * t + (vy - g / k) * f]);
    const e = Math.exp(-k * t);
    close(flyV(vx, vy, t, g, k), [vx * e, g / k + (vy - g / k) * e]);
    close(flyV(vx, vy, 60, g, k), [0, g / k], 6);
    close(fly(x, y, vx, vy, t, g, 1e-5), fly(x, y, vx, vy, t, g), 2);
    close(flyV(vx, vy, t, g, 1e-5), flyV(vx, vy, t, g), 2);
  });

  test('its velocity is the slope of its place', () => {
    const h = 1e-6;
    for (const drag of [0, 1.5]) {
      const [a, b] = [
        fly(0, 0, 80, -20, 0.4 - h, 300, drag),
        fly(0, 0, 80, -20, 0.4 + h, 300, drag),
      ];
      close([(b[0] - a[0]) / (2 * h), (b[1] - a[1]) / (2 * h)], flyV(80, -20, 0.4, 300, drag), 3);
    }
  });
});

/** The calls `emit` makes, each its arguments then two draws of its rng. */
const calls = (
  emit: (fn: (age: number, life: number, r: () => number, i: number) => void) => void,
): Call[] => {
  const out: Call[] = [];
  emit((age, life, r, i) => out.push([i, age, life, r(), r()]));
  return out;
};

describe('burst', () => {
  test('calls each of n particles once with the same numbers on every call, and another seed gives others', () => {
    const run = (seed: number) => {
      const out: (readonly number[])[] = [];
      burst(12, seed, (r, i) => out.push([i, r(), r(), r()]));
      return out;
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7).map((c) => c[0])).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(run(8)).not.toEqual(run(7));
    expect(new Set(run(7).map((c) => c[1])).size).toBe(12);
  });
});

describe('cycle', () => {
  const life = (r: () => number) => 0.4 + 0.6 * r();
  const at = (t: number) => calls((fn) => cycle(t, 1.5, 20, 3, life, fn));

  test('calls with the same numbers on every call at the same t', () => {
    expect(at(2.3)).toEqual(at(2.3));
    expect(at(2.3).length).toBeGreaterThan(0);
  });

  test('gives the same particles at t and t + period: the loop has no seam', () => {
    for (const t of [0, 0.37, 1.2, 5.9]) {
      const [a, b] = [at(t), at(t + 1.5)];
      expect(b.length).toBe(a.length);
      a.forEach((c, k) => close(c, b[k] ?? [], 6));
    }
  });

  test('every age it gives is under the particle life, which is fixed per particle', () => {
    const lives = new Map<number, number>();
    for (let t = 0; t < 3; t += 0.05)
      for (const [i, age, l] of at(t)) {
        expect(age).toBeGreaterThanOrEqual(0);
        expect(age).toBeLessThan(l);
        expect(lives.get(i) ?? l).toBe(l);
        lives.set(i, l);
      }
    expect(lives.size).toBe(20);
  });

  test('a life longer than the period gives each particle one copy per period it still lives', () => {
    const long = calls((fn) => cycle(4.2, 1, 5, 9, () => 2.5, fn));
    for (let i = 0; i < 5; i++) {
      const ages = long
        .filter((c) => c[0] === i)
        .map((c) => c[1])
        .toSorted((a, b) => a - b);
      expect(ages.length).toBeGreaterThanOrEqual(2);
      ages.slice(1).forEach((age, k) => expect(age - (ages[k] ?? 0)).toBeCloseTo(1, 9));
      ages.forEach((age) => expect(age).toBeLessThan(2.5));
    }
  });
});

describe('stream', () => {
  const life = (r: () => number) => 0.5 + r();
  const at = (t: number) => calls((fn) => stream(t, 1, 2, 10, 5, life, fn));

  test('calls with the same numbers on every call at the same t', () => {
    expect(at(1.6)).toEqual(at(1.6));
    expect(at(1.6).length).toBeGreaterThan(0);
  });

  test('emits nothing before t0', () => {
    for (const t of [-1, 0, 0.99]) expect(at(t)).toEqual([]);
  });

  test('births stop at t1, and it ends empty once its last particle outlives its life', () => {
    const born = (t: number) => at(t).map(([i, age]) => [i, t - age] as const);
    const last = Math.max(...born(2).map(([i]) => i));
    for (const t of [2.2, 2.6, 3]) {
      for (const [i, b] of born(t)) {
        expect(i).toBeLessThanOrEqual(last);
        expect(b).toBeLessThanOrEqual(2 + 1e-9);
      }
    }
    expect(at(2 + 1.5)).toEqual([]);
    expect(at(10)).toEqual([]);
  });

  test('a particle is born every 1 / rate s from t0, with the same life and rng at every t', () => {
    const seen = new Map<number, Call>();
    for (let t = 1; t < 3.5; t += 0.03)
      for (const [i, age, l, r0, r1] of at(t)) {
        expect(t - age).toBeCloseTo(1 + i / 10, 9);
        const was = seen.get(i);
        if (was) expect([was[2], was[3], was[4]]).toEqual([l, r0, r1]);
        seen.set(i, [i, age, l, r0, r1]);
      }
    expect(seen.size).toBe(11);
  });
});
