import { describe, expect, test } from 'bun:test';
import { BOIL_AMP, BOIL_TICKS, boilAt, boilField } from './boil.ts';

describe('the boil field', () => {
  test('the boil field loops at 48 ticks', () => {
    expect(BOIL_TICKS).toBe(48);
    for (const tick of [0, 7, 31]) {
      const a = boilField(tick, -3, 2, 6, 5);
      expect(boilField(tick + 48, -3, 2, 6, 5)).toEqual(a);
      expect(boilField(tick - 48, -3, 2, 6, 5)).toEqual(a);
      // a function of the tick alone: the same field twice
      expect(boilField(tick, -3, 2, 6, 5)).toEqual(a);
    }
    expect(boilField(1, 0, 0, 4, 4)).not.toEqual(boilField(0, 0, 0, 4, 4));
  });

  test('wanders as far as its amplitude: 0 holds every node still, the house amplitude by default', () => {
    expect(boilField(5, 0, 0, 3, 3, 0).every((v) => v === 0)).toBe(true);
    const house = boilField(5, 0, 0, 3, 3);
    expect(boilField(5, 0, 0, 3, 3, BOIL_AMP)).toEqual(house);
    const half = boilField(5, 0, 0, 3, 3, BOIL_AMP / 2);
    for (let i = 0; i < house.length; i++) expect(half[i]!).toBeCloseTo(house[i]! / 2, 6);
  });

  test("a node's field is its own, wherever the lattice it is read in starts", () => {
    const whole = boilField(9, 0, 0, 4, 4);
    const part = boilField(9, 2, 1, 2, 2);
    expect([part[0], part[1]]).toEqual([whole[(1 * 4 + 2) * 2], whole[(1 * 4 + 2) * 2 + 1]]);
  });

  test('wanders no more than the small boil, and a tick moves it a fraction of that', () => {
    let [most, step] = [0, 0];
    for (let t = 0; t < 48; t++) {
      const [a, b] = [boilField(t, 0, 0, 8, 8), boilField(t + 1, 0, 0, 8, 8)];
      for (let i = 0; i < a.length; i++) {
        most = Math.max(most, Math.abs(a[i]!));
        step = Math.max(step, Math.abs(b[i]! - a[i]!));
      }
    }
    expect(most).toBeLessThanOrEqual(BOIL_AMP + 1e-6);
    expect(step).toBeLessThanOrEqual(0.21);
  });

  test('is read between nodes by a smoothstep, each node standing on its own point', () => {
    const f = boilField(3, 0, 0, 3, 3);
    expect(boilAt(f, 3, 3, 24, 24)).toEqual([f[8]!, f[9]!]);
    const [mx] = boilAt(f, 3, 3, 12, 0);
    expect(mx).toBeCloseTo((f[0]! + f[2]!) / 2, 6);
  });
});
