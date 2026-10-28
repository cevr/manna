import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { type Puppet, type Skeleton, puppetOf, rasterOf, restPose } from './puppet.ts';

type PuppetSheet = Parameters<typeof puppetOf>[0];

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

/** A body box inked round its edge with a strip of its sheet's paper outside its line, and a sleeve over it whose rim row is half paper, half ink. */
const CLEAR = [0, 0, 0, 0] as const;
const rimSheet = () => {
  const painted = (colourAt: (x: number, y: number) => readonly number[]) => {
    const rgba = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        rgba.set(colourAt(x, y), (y * W + x) * 4);
      }
    return rgba;
  };
  const inBox = (x: number, y: number) => y >= 7 && y < 22 && x >= 20 && x < 44;
  const onEdge = (x: number, y: number) => y === 7 || x === 20 || x === 43;
  const body = painted((x, y) => {
    if (inBox(x, y) && onEdge(x, y)) return [40, 30, 20, 255];
    if (inBox(x, y)) return [200, 190, 160, 255];
    // the sheet's paper the body's cut kept outside its line, under the sleeve's rim
    if (y === 8 && x >= 10 && x < 13) return [250, 240, 220, 255];
    return CLEAR;
  });
  const arm = painted((x, y) => {
    if (x < 2 || x >= 62 || y < 8 || y >= 16) return CLEAR;
    // the sleeve's rim row: half paper, half ink, over the body
    if (y === 8) return [145, 135, 120, 255];
    return [40, 30, 20, 255];
  });
  return { arm, body };
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
    // the mesh grid is 3 px (`MESH_STEP`)
    for (const v of mesh.vertices) expect(v % 3).toBe(0);
  });

  test('at rest draws the sheet byte for byte', () => {
    const p = made(SLEEVE, TWO_BONES);
    expect(rasterOf(p, restPose(p)).rgba).toEqual(SLEEVE.parts[0]!.pixels.rgba);
  });

  test('turns a two-bone sleeve as computed by hand: shoulder 30°, elbow 45°', () => {
    const p = made(SLEEVE, TWO_BONES);
    const size = [W, 64] as const;
    const raster = rasterOf(
      p,
      { ...restPose(p), numbers: { shoulderRight: 30, elbowRight: 45 } },
      size,
    );
    const e = R(30, E[0] - S[0], E[1] - S[1]);
    const eAt = [S[0] + e[0], S[1] + e[1]] as const;
    // Each drawn pixel's centre taken back to the sleeve by hand: the upper arm turned 30° about the
    // shoulder, the forearm 75° about the moved elbow. The sleeve's colour is linear in x and y, so the
    // pixel holds the colour at that point (texel centres at +0.5).
    const held = (X: number, Y: number, rest: readonly [number, number]) => {
      const i = (Y * size[0] + X) * 4;
      const got = [...raster.rgba.subarray(i, i + 4)];
      const want = [4 * (rest[0] - 0.5), 255 - 3 * (rest[0] - 0.5), 9 * (rest[1] - 0.5), 255];
      for (let c = 0; c < 4; c++) expect(Math.abs(got[c]! - want[c]!)).toBeLessThanOrEqual(1);
    };
    let [upper, fore] = [0, 0];
    for (let Y = 0; Y < size[1]; Y++)
      for (let X = 0; X < size[0]; X++) {
        const u = R(-30, X + 0.5 - S[0], Y + 0.5 - S[1]);
        const f = R(-75, X + 0.5 - eAt[0], Y + 0.5 - eAt[1]);
        const up = [S[0] + u[0], S[1] + u[1]] as const;
        const fo = [E[0] + f[0], E[1] + f[1]] as const;
        if (up[0] >= 3 && up[0] <= 11 && up[1] >= 9 && up[1] <= 15) {
          upper++;
          held(X, Y, up);
        }
        if (fo[0] >= 52 && fo[0] <= 61 && fo[1] >= 9 && fo[1] <= 15) {
          fore++;
          held(X, Y, fo);
        }
      }
    expect(upper).toBeGreaterThanOrEqual(30);
    expect(fore).toBeGreaterThanOrEqual(30);
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

  test("keeps, revealed by the part in front, the paint the un-matte cleared behind that part's rim", () => {
    // a sleeve over a light body box inked round its edge, cut from a paper; the sleeve's rim, reached from the ground through the body, lies over its hidden paint
    const paper = [250, 240, 220] as const;
    const { arm, body } = rimSheet();
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
    // at rest the body's paint under the rim is cleared; revealed by the sleeve it is the body's own
    expect(at(back.pixels.rgba, 22, 8)).toEqual([0, 0, 0, 0]);
    expect(at(back.revealed[0]!.rgba, 22, 8)).toEqual([200, 190, 160, 255]);

    // the paper outside the body's line is the body's rim once the sleeve is gone: un-matted to nothing, not given back as paint
    expect(at(back.pixels.rgba, 11, 8)).toEqual([0, 0, 0, 0]);
    expect(at(back.revealed[0]!.rgba, 11, 8)).toEqual([0, 0, 0, 0]);

    // nothing else: the body's own pixels are its texture's
    expect(at(back.revealed[0]!.rgba, 30, 18)).toEqual([0, 0, 0, 0]);
    expect(back.revealed[1]).toBeUndefined();
    // a front part's own pixels are never given back
    expect(p.parts[0]!.revealed.filter(Boolean)).toEqual([]);
  });

  test('is deterministic: the same pose gives the same raster', () => {
    const p = made(SLEEVE, TWO_BONES);
    const pose = { ...restPose(p), numbers: { shoulderRight: 12.5, elbowRight: -20 } };
    expect(rasterOf(p, pose).rgba).toEqual(rasterOf(p, pose).rgba);
  });
});
