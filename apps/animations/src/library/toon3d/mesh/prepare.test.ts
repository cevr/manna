import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import type { SkinnedRest } from './glb.ts';
import type { MeshLabels } from './labels.ts';
import { prepareMesh } from './prepare.ts';

/**
 * A quad of two triangles, its shared edge's vertices doubled as a seam, 2 m
 * tall: its lower edge on the hand bone alone, its upper edge shared by the
 * hand (0.4) and the forearm (0.6).
 */
const QUAD: SkinnedRest = {
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 1, 2, 0, 0, 0, 0, 1, 2, 0, 0, 2, 0]),
  indices: Uint32Array.from([0, 1, 2, 3, 4, 5]),
  joints: Uint16Array.from({ length: 24 }, (_, i) => Number(i % 4 === 1)),
  weights: Float32Array.from([
    1, 0, 0, 0, 1, 0, 0, 0, 0.4, 0.6, 0, 0, 1, 0, 0, 0, 0.4, 0.6, 0, 0, 0.4, 0.6, 0, 0,
  ]),
  skeleton: [
    { name: 'RightHand', parent: Option.none(), head: [0.5, 1, 0] },
    { name: 'RightForeArm', parent: Option.none(), head: [0.5, 2, 0] },
  ],
};

/** Rules whose every line lies far from the quad: all of it is tunic. */
const TUNIC_ONLY: MeshLabels = {
  hairline: { axis: [0, 0], knots: [[0, 100]] },
  neckline: { axis: [0, 0], knots: [[0, 100]] },
  hand: 0,
  mantle: { edges: [], hem: { point: [0, 100, 0], normal: [0, 1, 0] } },
  ankle: { point: [0, -100, 0], normal: [0, -1, 0] },
  bulge: {
    top: { point: [0, 100, 0], normal: [0, -1, 0] },
    bottom: { point: [0, 100, 0], normal: [0, 1, 0] },
  },
};

describe('prepareMesh', () => {
  const mesh = prepareMesh(QUAD, TUNIC_ONLY, 4);

  test("the seam's doubled vertices weld into one, and the triangles keep their order", () => {
    expect(mesh.rig.positions.length / 3).toBe(4);
    expect([...mesh.indices]).toEqual([0, 1, 2, 0, 2, 3]);
  });

  test('the mesh stands at the height asked, soles at 0, centred on x, and its joints move with it', () => {
    const ys = [...mesh.rig.positions].filter((_, i) => i % 3 === 1);
    const xs = [...mesh.rig.positions].filter((_, i) => i % 3 === 0);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...ys)).toBeCloseTo(4, 6);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 6);
    expect(mesh.rig.heads[0]).toEqual([0, 2, 0]);
  });

  test("each vertex's right-hand lead is its hand weight less its largest other weight, and the rules ride along", () => {
    const right = [0, 1, 2, 3].map((v) => mesh.hands[v * 2] ?? 0);
    expect(right[0]).toBeCloseTo(1, 6);
    expect(right[1]).toBeCloseTo(1, 6);
    expect(right[2]).toBeCloseTo(-0.2, 6);
    expect(right[3]).toBeCloseTo(-0.2, 6);
    expect(mesh.labels).toBe(TUNIC_ONLY);
  });
});
