import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import type { SkinnedRest } from './glb.ts';
import { LABELS, prepareMesh } from './prepare.ts';

/** A quad of two triangles, its shared edge's vertices doubled as a seam, 2 m tall, skinned to one joint. */
const QUAD: SkinnedRest = {
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 1, 2, 0, 0, 0, 0, 1, 2, 0, 0, 2, 0]),
  indices: Uint32Array.from([0, 1, 2, 3, 4, 5]),
  joints: new Uint16Array(24),
  weights: Float32Array.from({ length: 24 }, (_, i) => Number(i % 4 === 0)),
  skeleton: [{ name: 'Hips', parent: Option.none(), head: [0.5, 1, 0] }],
};

const SKIN = LABELS.indexOf('skin');
const TUNIC = LABELS.indexOf('tunic');

describe('prepareMesh', () => {
  const mesh = prepareMesh(QUAD, [SKIN, TUNIC], { height: 4, labelRounds: 2 });

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

  test("each vertex's label shares sum to 1, and a vertex only one label touches keeps some of it", () => {
    const width = LABELS.length - 1;
    for (let v = 0; v < 4; v++) {
      const shares = [...mesh.labels.subarray(v * width, v * width + width)];
      expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    }
    expect(mesh.labels[1 * width + SKIN - 1] ?? 0).toBeGreaterThan(0.5);
    expect(mesh.labels[3 * width + TUNIC - 1] ?? 0).toBeGreaterThan(0.5);
  });
});
