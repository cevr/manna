import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import {
  MESH_STEP,
  type Puppet,
  type PuppetSheet,
  type Skeleton,
  posedVertices,
  puppetOf,
  rasterOf,
  restPose,
} from './puppet.ts';

const [W, H] = [64, 24];

/** A 64 × 24 sleeve (x 2..62, y 8..16), each pixel its own colour, as one part. */
const SLEEVE: PuppetSheet = (() => {
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 8; y < 16; y++)
    for (let x = 2; x < 62; x++) rgba.set([x * 4, 255 - x * 3, y * 9, 255], (y * W + x) * 4);
  return { width: W, height: H, parts: [{ name: 'arm', pixels: { width: W, height: H, rgba } }] };
})();

const S = [4, 12] as const;
const E = [32, 12] as const;
const TWO_BONES: Skeleton = {
  bones: [
    { name: 'shoulderRight', pivot: S, tip: E },
    { name: 'elbowRight', parent: 'shoulderRight', pivot: E, tip: [60, 12] },
  ],
  skin: { arm: ['shoulderRight', 'elbowRight'] },
};

const made = (sheet: PuppetSheet, skeleton: Skeleton): Puppet =>
  Result.getOrThrow(puppetOf(sheet, skeleton));

const R = (deg: number, x: number, y: number) => {
  const t = (deg * Math.PI) / 180;
  return [Math.cos(t) * x - Math.sin(t) * y, Math.sin(t) * x + Math.cos(t) * y] as const;
};

describe('a puppet', () => {
  test('weighs each vertex on at most two bones its skin names, totalling 1', () => {
    const { mesh } = made(SLEEVE, TWO_BONES).parts[0]!;
    expect(mesh.vertices.length).toBeGreaterThan(0);
    for (const w of mesh.weights) {
      expect(w.length).toBeGreaterThanOrEqual(1);
      expect(w.length).toBeLessThanOrEqual(2);
      expect(Math.abs(w.reduce((s, e) => s + e.weight, 0) - 1)).toBeLessThan(1e-12);
      for (const e of w) expect(['shoulderRight', 'elbowRight']).toContain(e.bone);
    }
    // the vertices are the grid's points over the part's cells
    for (const v of mesh.vertices) expect(v % MESH_STEP).toBe(0);
  });

  test('at rest is its bind pose, and its raster the sheet byte for byte', () => {
    const p = made(SLEEVE, TWO_BONES);
    const rest = restPose(p);
    expect([...posedVertices(p, rest)[0]!]).toEqual([...p.parts[0]!.mesh.vertices]);
    expect(rasterOf(p, rest).rgba).toEqual(SLEEVE.parts[0]!.pixels.rgba);
  });

  test('turns a two-bone sleeve as computed by hand: shoulder 30°, elbow 45°', () => {
    const p = made(SLEEVE, TWO_BONES);
    const posed = posedVertices(p, {
      ...restPose(p),
      numbers: { shoulderRight: 30, elbowRight: 45 },
    })[0]!;
    const { vertices, weights } = p.parts[0]!.mesh;
    const e = R(30, E[0] - S[0], E[1] - S[1]);
    const [eAt0, eAt1] = [S[0] + e[0], S[1] + e[1]];
    let [upper, fore] = [0, 0];
    for (let i = 0; i < vertices.length / 2; i++) {
      const [x, y] = [vertices[2 * i]!, vertices[2 * i + 1]!];
      const got = [posed[2 * i]!, posed[2 * i + 1]!];
      if (x <= 12) {
        upper++;
        expect(weights[i]).toEqual([{ bone: 'shoulderRight', weight: 1 }]);
        const q = R(30, x - S[0], y - S[1]);
        expect(Math.hypot(got[0]! - S[0] - q[0], got[1]! - S[1] - q[1])).toBeLessThan(1e-9);
      }
      if (x >= 51) {
        fore++;
        expect(weights[i]).toEqual([{ bone: 'elbowRight', weight: 1 }]);
        const q = R(75, x - E[0], y - E[1]);
        expect(Math.hypot(got[0]! - eAt0 - q[0], got[1]! - eAt1 - q[1])).toBeLessThan(1e-9);
      }
    }
    expect(upper).toBeGreaterThanOrEqual(3);
    expect(fore).toBeGreaterThanOrEqual(3);
  });

  test("gives a shoulder flap's vertices to the body: 0 within the cap, 1 at its reach above the pivot", () => {
    const [w, h] = [48, 48];
    const arm = new Uint8Array(w * h * 4);
    const body = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (x >= 4 && x < 12 && y >= 6) arm.set([200, 40, 40, 255], (y * w + x) * 4);
        else if (x >= 4) body.set([40, 40, 200, 255], (y * w + x) * 4);
      }
    const sheet: PuppetSheet = {
      width: w,
      height: h,
      parts: [
        { name: 'arm', pixels: { width: w, height: h, rgba: arm } },
        { name: 'body', pixels: { width: w, height: h, rgba: body } },
      ],
    };
    const p = made(sheet, {
      bones: [
        { name: 'lean', pivot: [24, 46], tip: [24, 0] },
        { name: 'shoulderRight', parent: 'lean', pivot: [8, 40], tip: [8, 47] },
      ],
      skin: { arm: ['shoulderRight', 'lean'], body: ['lean'] },
      flaps: [
        {
          part: 'arm',
          from: 'body',
          bone: 'shoulderRight',
          body: 'lean',
          cap: 4,
          reach: 34,
          region: [
            [0, 0],
            [16, 0],
            [16, 44],
            [0, 44],
          ],
        },
      ],
    });
    const { vertices, weights } = p.parts[0]!.mesh;
    const leanAt = (x: number, y: number) => {
      const i = [...Array(vertices.length / 2).keys()].find(
        (k) => vertices[2 * k] === x && vertices[2 * k + 1] === y,
      )!;
      return weights[i]!.find((e) => e.bone === 'lean')?.weight ?? 0;
    };
    expect(leanAt(9, 39)).toBe(0);
    expect(leanAt(9, 3)).toBe(1);
    expect(leanAt(9, 21)).toBeGreaterThan(0);
    expect(leanAt(9, 21)).toBeLessThan(1);
    // the flap's body pixels are in the arm's texture, so its rest raster is still the sheet
    expect(p.parts[0]!.pixels.rgba[(10 * w + 14) * 4 + 3]).toBe(255);
    const laid = Uint8Array.from(body);
    for (let i = 0; i < arm.length; i += 4)
      if (arm[i + 3]! > 0) laid.set(arm.subarray(i, i + 4), i);
    expect(rasterOf(p, restPose(p)).rgba).toEqual(laid);
  });

  test('is refused for a skeleton that names what the sheet or itself lacks', () => {
    const refused = (skeleton: Skeleton) => Result.isFailure(puppetOf(SLEEVE, skeleton));
    expect(refused({ ...TWO_BONES, skin: { leg: ['shoulderRight'] } })).toBe(true);
    expect(refused({ ...TWO_BONES, skin: { arm: ['wrist'] } })).toBe(true);
    expect(
      refused({ bones: [{ name: 'a', parent: 'b', pivot: [0, 0], tip: [1, 0] }], skin: {} }),
    ).toBe(true);
  });

  test("gives back, uncovered, the paint the un-matte cleared behind a front part's rim", () => {
    // a sleeve over a light body box, cut from a paper; the sleeve's rim, reached from the ground through the body, lies over its hidden paint
    const paper = [250, 240, 220] as const;
    const arm = new Uint8Array(W * H * 4);
    const body = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (y >= 6 && y < 22 && x >= 20 && x < 44) body.set([200, 190, 160, 255], i);
        if (y >= 8 && y < 16 && x >= 2 && x < 62) arm.set([40, 30, 20, 255], i);
        // the sleeve's rim row: half paper, half ink, over the body
        if (y === 8 && x >= 2 && x < 62) arm.set([145, 135, 120, 255], i);
      }
    const sheet: PuppetSheet = {
      width: W,
      height: H,
      paper,
      parts: [
        { name: 'arm', pixels: { width: W, height: H, rgba: arm } },
        { name: 'body', pixels: { width: W, height: H, rgba: body } },
      ],
    };
    const p = made(sheet, {
      ...TWO_BONES,
      skin: { arm: ['shoulderRight', 'elbowRight'], body: [] },
    });
    const at = (r: Uint8Array, x: number, y: number) => [
      ...r.subarray((y * W + x) * 4, (y * W + x) * 4 + 4),
    ];
    const back = p.parts[1]!;
    // at rest the body's paint under the rim is cleared; uncovered it is the body's own
    expect(at(back.pixels.rgba, 30, 8)).toEqual([0, 0, 0, 0]);
    expect(at(back.uncovered.rgba, 30, 8)).toEqual([200, 190, 160, 255]);
    // the body's own pixels elsewhere are its pixels in both
    expect(at(back.uncovered.rgba, 30, 18)).toEqual(at(back.pixels.rgba, 30, 18));
    // a front part's own pixels are never given back
    expect(p.parts[0]!.uncovered.rgba).toEqual(p.parts[0]!.pixels.rgba);
  });

  test('is deterministic: the same pose gives the same raster', () => {
    const p = made(SLEEVE, TWO_BONES);
    const pose = { ...restPose(p), numbers: { shoulderRight: 12.5, elbowRight: -20 } };
    expect(rasterOf(p, pose).rgba).toEqual(rasterOf(p, pose).rgba);
  });
});
