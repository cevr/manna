import { describe, expect, test } from 'bun:test';
import type { Vec3 } from '../spec.ts';
import { azimuthOf, bodyLabelAt, heightAt, isHand, type MeshLabels } from './labels.ts';

/**
 * Rules on a figure 4 tall: hair above 3.5 at the front and 3 at the back,
 * skin above 2.5, sandal below 0.2, the mantle on +x above 1 (or, with a
 * second edge, on +x and in front), the sash bulge from 1.8 to 2.
 */
const RULES: MeshLabels = {
  hairline: {
    axis: [0, 0],
    knots: [
      [0, 3.5],
      [180, 3],
    ],
  },
  neckline: { axis: [0, 0], knots: [[0, 2.5]] },
  hand: 0.1,
  mantle: {
    edges: [{ point: [0, 0, 0], normal: [1, 0, 0] }],
    hem: { point: [0, 1, 0], normal: [0, 1, 0] },
  },
  ankle: { point: [0, 0.2, 0], normal: [0, -1, 0] },
  bulge: {
    top: { point: [0, 2, 0], normal: [0, -1, 0] },
    bottom: { point: [0, 1.8, 0], normal: [0, 1, 0] },
  },
};

const at = (p: Vec3, rules: MeshLabels = RULES) => bodyLabelAt(rules, p);

describe('the hairline', () => {
  test('hair lies above the curve, skin below it, at the front and at the back', () => {
    expect(at([0, 3.55, 0.3])).toBe('hair');
    expect(at([0, 3.45, 0.3])).toBe('skin');
    expect(at([0, 3.05, -0.3])).toBe('hair');
    expect(at([0, 2.95, -0.3])).toBe('skin');
  });

  test('the curve eases between its knots with no corner, the same on either side', () => {
    const curve = RULES.hairline;
    expect(heightAt(curve, 90)).toBeCloseTo(3.25, 9);
    expect(heightAt(curve, 0)).toBe(3.5);
    expect(heightAt(curve, 180)).toBe(3);
    const slope = (a: number) => (heightAt(curve, a + 1e-4) - heightAt(curve, a - 1e-4)) / 2e-4;
    expect(Math.abs(slope(1e-3))).toBeLessThan(1e-3);
    expect(azimuthOf([0, 0], [0.3, 0, 0])).toBeCloseTo(90, 9);
    expect(azimuthOf([0, 0], [-0.3, 0, 0])).toBeCloseTo(90, 9);
    expect(at([0.3, 3.3, 0])).toBe(at([-0.3, 3.3, 0]));
  });
});

describe('the skin', () => {
  test('the head and neck below the hairline and above the neckline are skin; below the neckline is cloth', () => {
    expect(at([0, 2.6, 0.1])).toBe('skin');
    expect(at([-0.2, 2.4, 0.1])).toBe('tunic');
  });

  test("an arm's hand is where its hand bone leads the other bones by more than the rule's lead", () => {
    expect(isHand(RULES, 0.5)).toBe(true);
    expect(isHand(RULES, 0.1)).toBe(false);
    expect(isHand(RULES, -0.3)).toBe(false);
  });
});

describe('the mantle', () => {
  test('one edge: the mantle on its side above the hem, tunic across the edge or below the hem', () => {
    expect(at([0.2, 1.5, 0])).toBe('mantle');
    expect(at([-0.2, 1.5, 0])).toBe('tunic');
    expect(at([0.2, 0.9, 0])).toBe('tunic');
  });

  test('two edges: the mantle only where both hold', () => {
    const two: MeshLabels = {
      ...RULES,
      mantle: {
        ...RULES.mantle,
        edges: [...RULES.mantle.edges, { point: [0, 0, 0], normal: [0, 0, 1] }],
      },
    };
    expect(at([0.2, 1.5, 0.1], two)).toBe('mantle');
    expect(at([0.2, 1.5, -0.1], two)).toBe('tunic');
    expect(at([-0.2, 1.5, 0.1], two)).toBe('tunic');
  });
});

describe('the sandals', () => {
  test('below the ankle plane is sandal, though the mantle rule would hold there', () => {
    const low: MeshLabels = { ...RULES, mantle: { ...RULES.mantle, hem: RULES.ankle } };
    expect(at([0.2, 0.1, 0])).toBe('sandal');
    expect(at([0.2, 0.1, 0], low)).toBe('sandal');
    expect(at([-0.2, 0.3, 0])).toBe('tunic');
  });
});

describe('the sash bulge', () => {
  test('the bulge is tunic on the mantle side too, and the mantle resumes past it', () => {
    expect(at([0.2, 1.9, 0.3])).toBe('tunic');
    expect(at([-0.2, 1.9, 0.3])).toBe('tunic');
    expect(at([0.2, 2.1, 0.3])).toBe('mantle');
    expect(at([0.2, 1.7, 0.3])).toBe('mantle');
  });
});
