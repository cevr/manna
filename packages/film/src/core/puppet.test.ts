import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import {
  type Puppet,
  type Skeleton,
  posedVertices,
  puppetOf,
  rasterOf,
  restPose,
} from './puppet.ts';

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

/** The distance from `p` to the segment `a`–`b`, worked here apart from the module's own. */
const segmentGap = (
  p: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};

const R = (deg: number, x: number, y: number) => {
  const t = (deg * Math.PI) / 180;
  return [Math.cos(t) * x - Math.sin(t) * y, Math.sin(t) * x + Math.cos(t) * y] as const;
};

/** `y0..y1` of x 8..56 painted `paint`, the rest clear: a part cut along a row. */
const cut = (y0: number, y1: number, paint: ReadonlyArray<number>) => {
  const rgba = new Uint8Array(W * H * 4);
  for (let y = y0; y < y1; y++) for (let x = 8; x < 56; x++) rgba.set(paint, (y * W + x) * 4);
  return { width: W, height: H, rgba };
};

/** A skirt (front) and a shirt (behind) cut along y = 12, hard edges both sides. */
const CUT_SHEET: PuppetSheet = {
  width: W,
  height: H,
  parts: [
    { name: 'skirt', pixels: cut(12, 20, [40, 60, 200, 255]) },
    { name: 'shirt', pixels: cut(4, 12, [200, 60, 40, 255]) },
  ],
};

const LEAN = [{ name: 'lean', pivot: [32, 12] as const, tip: [32, 2] as const }];

/** `CUT_SHEET`'s puppet on `skin`, and the least alpha it draws, still at scale 0.9, about the line. */
const seamless = (skin: Skeleton['skin']) => {
  const p = made(CUT_SHEET, { bones: LEAN, skin, root: [0, 0] });
  const r = rasterOf(p, { numbers: {}, root: [0, 0], scale: 0.9 });
  // the pixels the seam crosses (y 10.8), well inside the two parts' 7.2..50.4 x 3.6..18
  const alphas: number[] = [];
  for (let y = 9; y <= 12; y++)
    for (let x = 10; x <= 48; x++) alphas.push(r.rgba[(y * W + x) * 4 + 3]!);
  return { p, min: Math.min(...alphas) };
};

/** At rest the skirt still hides what seals the shirt: `CUT_SHEET` drawn byte for byte. */
const expectSheetAtRest = (p: Puppet) => {
  const rest = rasterOf(p, restPose(p)).rgba;
  for (let i = 0; i < W * H; i++) {
    const front = Number(CUT_SHEET.parts[0]!.pixels.rgba[i * 4 + 3] === 0);
    expect([...rest.subarray(i * 4, i * 4 + 4)]).toEqual([
      ...CUT_SHEET.parts[front]!.pixels.rgba.subarray(i * 4, i * 4 + 4),
    ]);
  }
};

describe('a puppet', () => {
  test('weighs each vertex on at most two bones its skin names, totalling 1', () => {
    const p = made(SLEEVE, TWO_BONES);
    const { mesh } = p.parts[0]!;
    expect(mesh.vertices.length).toBeGreaterThan(0);
    for (let i = 0; i < mesh.vertices.length / 2; i++) {
      const on = [0, 1].filter((j) => mesh.bones[2 * i + j]! >= 0);
      expect(on.length).toBeGreaterThanOrEqual(1);
      expect(Math.abs(on.reduce((s, j) => s + mesh.amounts[2 * i + j]!, 0) - 1)).toBeLessThan(
        1e-12,
      );
      for (const j of on)
        expect(['shoulderRight', 'elbowRight']).toContain(p.bones[mesh.bones[2 * i + j]!]!.name);
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
    const { vertices, bones, amounts } = p.parts[0]!.mesh;
    const lean = p.bones.findIndex((b) => b.name === 'lean');
    const leanAt = (x: number, y: number) => {
      const i = [...Array(vertices.length / 2).keys()].find(
        (k) => vertices[2 * k] === x && vertices[2 * k + 1] === y,
      )!;
      return [0, 1]
        .filter((k) => bones[2 * i + k] === lean)
        .reduce((sum, k) => sum + amounts[2 * i + k]!, 0);
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

  test('two flaps on one part are refused', () => {
    const [w, h] = [16, 16];
    const pixels = { width: w, height: h, rgba: new Uint8Array(w * h * 4).fill(255) };
    const sheet: PuppetSheet = {
      width: w,
      height: h,
      parts: [
        { name: 'arm', pixels },
        { name: 'body', pixels },
      ],
    };
    const flap = {
      part: 'arm',
      from: 'body',
      bone: 'shoulderRight',
      body: 'lean',
      cap: 2,
      reach: 8,
      region: [
        [0, 0],
        [8, 0],
        [8, 8],
        [0, 8],
      ],
    } as const;
    const skeleton: Skeleton = {
      bones: [
        { name: 'lean', pivot: [8, 15], tip: [8, 0] },
        { name: 'shoulderRight', parent: 'lean', pivot: [4, 8], tip: [4, 15] },
      ],
      skin: { arm: ['shoulderRight', 'lean'], body: ['lean'] },
      flaps: [flap],
    };
    expect(Result.isSuccess(puppetOf(sheet, skeleton))).toBe(true);
    const twice = puppetOf(sheet, { ...skeleton, flaps: [flap, { ...flap, cap: 3 }] });
    expect(Result.isFailure(twice)).toBe(true);
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

  test('leaves no seam at a fractional scale between two parts cut along one line that move together', () => {
    const together = seamless({ skirt: ['lean'], shirt: ['lean'] });
    expect(together.min).toBe(255);
    expectSheetAtRest(together.p);

    // a part that moves on its own is not sealed under in its texture: the shirt keeps its cut
    const apart = seamless({ skirt: ['lean'], shirt: [] });
    expect(apart.p.parts[1]!.pixels.rgba).toEqual(CUT_SHEET.parts[1]!.pixels.rgba);
  });

  test('leaves no seam at a fractional scale between two parts of different skins cut along one line while still, and shows no seal where the front part moved', () => {
    const { p, min } = seamless({ skirt: ['lean'], shirt: [] });
    expect(min).toBe(255);
    expect(p.parts[1]!.seals[0]).toBeDefined();
    expectSheetAtRest(p);

    // the skirt turned: the line opens, and the shirt shows no seal, as if it had none
    const stripped: Puppet = { ...p, parts: p.parts.map((part) => ({ ...part, seals: [] })) };
    const turned = { numbers: { lean: 30 }, root: [0, 0] as const, scale: 0.9 };
    expect(rasterOf(p, turned).rgba).toEqual(rasterOf(stripped, turned).rgba);
    // and still, the seal is what closes the line
    const still = { numbers: {}, root: [0, 0] as const, scale: 0.9 };
    expect(rasterOf(p, still).rgba).not.toEqual(rasterOf(stripped, still).rgba);
  });

  test('a vertex nearest the upper bone does not follow the elbow', () => {
    // an arm bent back on itself: the upper arm along y = 6, the forearm from the elbow back under it
    const [N, U0, EL, F1] = [48, [6, 6], [36, 6], [6, 36]] as const;
    const rgba = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const c = [x + 0.5, y + 0.5] as const;
        const d = Math.min(segmentGap(c, U0, EL), segmentGap(c, EL, F1));
        if (d <= 3) rgba.set([120, 80, 60, 255], (y * N + x) * 4);
      }
    const p = made(
      { width: N, height: N, parts: [{ name: 'arm', pixels: { width: N, height: N, rgba } }] },
      {
        bones: [
          { name: 'upper', pivot: U0, tip: EL },
          { name: 'forearm', parent: 'upper', pivot: EL, tip: F1 },
        ],
        skin: { arm: ['upper', 'forearm'] },
      },
    );
    const rest = posedVertices(p, restPose(p))[0]!;
    const bent = posedVertices(p, { ...restPose(p), numbers: { forearm: 90 } })[0]!;
    const held: number[] = [];
    for (let i = 0; i < rest.length / 2; i++) {
      const v = [rest[2 * i]!, rest[2 * i + 1]!] as const;
      const nearerUpper = segmentGap(v, EL, F1) - segmentGap(v, U0, EL) > 2;
      if (!nearerUpper || Math.hypot(v[0] - EL[0], v[1] - EL[1]) <= 16) continue;
      held.push(Math.hypot(bent[2 * i]! - v[0], bent[2 * i + 1]! - v[1]));
    }
    expect(held.length).toBeGreaterThan(0);
    expect(Math.max(...held)).toBeLessThan(0.5);
  });

  test('an elbow turn tears no mesh edge on a limb bent at rest 90° or 135°', () => {
    // the upper arm along y = 6 to the elbow, the forearm bent down (90°) or back under it (135°);
    // `fold` is the angle the two bones make at the elbow, radians
    const [N, U0, EL, TURN] = [48, [6, 6], [36, 6], 60] as const;
    for (const [F1, fold] of [
      [[36, 36], Math.PI / 2],
      [[6, 36], Math.PI / 4],
    ] as const) {
      const rgba = new Uint8Array(N * N * 4);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const c = [x + 0.5, y + 0.5] as const;
          const d = Math.min(segmentGap(c, U0, EL), segmentGap(c, EL, F1));
          if (d <= 4) rgba.set([120, 80, 60, 255], (y * N + x) * 4);
        }
      const p = made(
        { width: N, height: N, parts: [{ name: 'arm', pixels: { width: N, height: N, rgba } }] },
        {
          bones: [
            { name: 'upper', pivot: U0, tip: EL },
            { name: 'forearm', parent: 'upper', pivot: EL, tip: F1 },
          ],
          skin: { arm: ['upper', 'forearm'] },
        },
      );
      const rest = posedVertices(p, restPose(p))[0]!;
      const bent = posedVertices(p, { ...restPose(p), numbers: { forearm: TURN } })[0]!;
      const tris = p.parts[0]!.mesh.triangles;
      // An edge turned rigidly changes by 2 · sin(turn / 2) of its length. Across the crease the
      // weights cross from one bone to the other round the fold's arc, which adds a shear of the
      // turn's change over the share of the arc they cross on; a tight fold leaves less arc, so
      // more shear, and no weights avoid it. Crossing on two fifths of the arc or more bounds the
      // shear by 1 / (0.4 · fold) of the rigid change; a weight that jumps tears past it.
      const bound = 2 * Math.sin((TURN * Math.PI) / 360) * (1 + 1 / (0.4 * fold));
      let worst = 0;
      for (let t = 0; t < tris.length; t += 3)
        for (const [i, j] of [
          [tris[t]!, tris[t + 1]!],
          [tris[t + 1]!, tris[t + 2]!],
          [tris[t + 2]!, tris[t]!],
        ] as const) {
          const [rx, ry] = [rest[2 * i]! - rest[2 * j]!, rest[2 * i + 1]! - rest[2 * j + 1]!];
          const change = Math.hypot(
            bent[2 * i]! - bent[2 * j]! - rx,
            bent[2 * i + 1]! - bent[2 * j + 1]! - ry,
          );
          worst = Math.max(worst, change / Math.hypot(rx, ry));
        }
      expect(worst).toBeLessThan(bound);
    }
  });

  test('rasterOf lays revealed paint where a turned part moved away', () => {
    const { arm, body } = rimSheet();
    const p = made(
      {
        width: W,
        height: H,
        paper: [250, 240, 220],
        parts: [
          { name: 'arm', pixels: { width: W, height: H, rgba: arm } },
          { name: 'body', pixels: { width: W, height: H, rgba: body } },
        ],
      },
      { ...TWO_BONES, skin: { arm: ['shoulderRight', 'elbowRight'], body: [] } },
    );
    // the sleeve swung up off the body: the body's paint its rim hid shows where it lay
    const r = rasterOf(p, { ...restPose(p), numbers: { shoulderRight: 90 } }).rgba;
    const i = (8 * W + 22) * 4;
    expect([...r.subarray(i, i + 4)]).toEqual([200, 190, 160, 255]);
  });

  test('is deterministic: the same pose gives the same raster', () => {
    const p = made(SLEEVE, TWO_BONES);
    const pose = { ...restPose(p), numbers: { shoulderRight: 12.5, elbowRight: -20 } };
    expect(rasterOf(p, pose).rgba).toEqual(rasterOf(p, pose).rgba);
  });
});
