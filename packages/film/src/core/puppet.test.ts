import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import {
  type Puppet,
  type Skeleton,
  posedVertices,
  puppetOf,
  rasterOf,
  restPose,
  unmattedKey,
} from './puppet.ts';

type PuppetSheet = Parameters<typeof puppetOf>[0];

const [W, H] = [64, 24];

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
    if (y === 8 && x >= 10 && x < 13) return [250, 240, 220, 255];
    return CLEAR;
  });
  const arm = painted((x, y) => {
    if (x < 2 || x >= 62 || y < 8 || y >= 16) return CLEAR;
    if (y === 8) return [145, 135, 120, 255];
    return [40, 30, 20, 255];
  });
  return { arm, body };
};

const made = (sheet: PuppetSheet, skeleton: Skeleton): Puppet =>
  Result.getOrThrow(puppetOf(sheet, skeleton));

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

type Pt = readonly [number, number];

const LIMB = ['upper', 'forearm', 'hand'];

const limb = (w: number, h: number, half: number, joints: ReadonlyArray<Pt>) => {
  const segments = joints.slice(1).map((tip, i) => [joints[i]!, tip] as const);
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = [x + 0.5, y + 0.5] as const;
      if (Math.min(...segments.map(([a, b]) => segmentGap(c, a, b))) <= half)
        rgba.set([120, 80, 60, 255], (y * w + x) * 4);
    }
  const bones = segments.map(([pivot, tip], i) => ({
    name: LIMB[i]!,
    ...(i > 0 && { parent: LIMB[i - 1]! }),
    pivot,
    tip,
  }));
  return { pixels: { width: w, height: h, rgba }, bones };
};

const amountsOf = (p: Puppet, k: number) => {
  const { vertices, bones, amounts } = p.parts[k]!.mesh;
  const slots = bones.length / (vertices.length / 2);
  const out = new Map<string, Map<string, number>>();
  for (let i = 0; i < vertices.length / 2; i++) {
    const own = new Map<string, number>();
    for (let s = 0; s < slots; s++) {
      const b = bones[slots * i + s]!;
      if (b >= 0)
        own.set(p.bones[b]!.name, (own.get(p.bones[b]!.name) ?? 0) + amounts[slots * i + s]!);
    }
    out.set(`${vertices[2 * i]},${vertices[2 * i + 1]}`, own);
  }
  return out;
};

const FOLDED = (() => {
  const N = 140;
  const arm = limb(N, N, 8, [
    [70, 30],
    [70, 100],
    [86, 48],
    [89, 20],
  ]);
  const body = new Uint8Array(N * N * 4);
  for (let y = 10; y < N; y++)
    for (let x = 10; x < 70; x++) body.set([40, 40, 200, 255], (y * N + x) * 4);
  const lean = { name: 'lean', pivot: [40, 160] as const, tip: [40, 0] as const };
  const bones = [lean, { ...arm.bones[0]!, parent: 'lean' }, ...arm.bones.slice(1)];
  const flap = {
    part: 'arm',
    from: 'body',
    bone: 'upper',
    body: 'lean',
    cap: 6,
    reach: 20,
    region: [
      [54, 0],
      [100, 0],
      [100, 42],
      [54, 42],
    ] as ReadonlyArray<Pt>,
  };
  return {
    flap,
    puppet: made(
      {
        width: N,
        height: N,
        parts: [
          { name: 'arm', pixels: arm.pixels },
          { name: 'body', pixels: { width: N, height: N, rgba: body } },
        ],
      },
      { bones, skin: { arm: [...LIMB, 'lean'], body: ['lean'] }, flaps: [flap] },
    ),
    alone: () =>
      made(
        { width: N, height: N, parts: [{ name: 'arm', pixels: arm.pixels }] },
        { bones, skin: { arm: LIMB } },
      ),
  };
})();

const slopeTo = (p: Puppet, bone: string) => {
  const named = (name: string) => p.bones.find((b) => b.name === name)!;
  const length = (b: Puppet['bones'][number]) =>
    Math.hypot(b.tip[0] - b.pivot[0], b.tip[1] - b.pivot[1]);
  let slope = 0;
  for (let child = named(bone); LIMB.includes(child.parent ?? '');) {
    const parent = named(child.parent!);
    const blend = Math.min(18, 0.5 * Math.min(length(parent), length(child)));
    const [ax, ay] = [parent.pivot[0] - child.pivot[0], parent.pivot[1] - child.pivot[1]];
    const [bx, by] = [child.tip[0] - child.pivot[0], child.tip[1] - child.pivot[1]];
    const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
    slope += 3 / (blend * (1 + Math.max(0.05, (1 - cos) / 2)));
    child = parent;
  }
  return slope;
};

const worstTear = (p: Puppet, bone: string, slope: number) => {
  const c = p.bones.find((b) => b.name === bone)!.pivot;
  const rest = posedVertices(p, restPose(p))[0]!;
  const tris = p.parts[0]!.mesh.triangles;
  let worst = 0;
  for (const turn of [60, -60]) {
    const bent = posedVertices(p, { ...restPose(p), numbers: { [bone]: turn } })[0]!;
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
        const rho = Math.min(
          Math.hypot(rest[2 * i]! - c[0], rest[2 * i + 1]! - c[1]),
          Math.hypot(rest[2 * j]! - c[0], rest[2 * j + 1]! - c[1]),
        );
        worst = Math.max(worst, change / (Math.hypot(rx, ry) * (1 + slope * rho)));
      }
  }
  return worst;
};

const cut = (y0: number, y1: number, paint: ReadonlyArray<number>) => {
  const rgba = new Uint8Array(W * H * 4);
  for (let y = y0; y < y1; y++) for (let x = 8; x < 56; x++) rgba.set(paint, (y * W + x) * 4);
  return { width: W, height: H, rgba };
};

const CUT_SHEET: PuppetSheet = {
  width: W,
  height: H,
  parts: [
    { name: 'skirt', pixels: cut(12, 20, [40, 60, 200, 255]) },
    { name: 'shirt', pixels: cut(4, 12, [200, 60, 40, 255]) },
  ],
};

const LEAN = [{ name: 'lean', pivot: [32, 12] as const, tip: [32, 2] as const }];

const seamless = (skin: Skeleton['skin']) => {
  const p = made(CUT_SHEET, { bones: LEAN, skin, root: [0, 0] });
  const r = rasterOf(p, { numbers: {}, root: [0, 0], scale: 0.9 });
  const alphas: number[] = [];
  for (let y = 9; y <= 12; y++)
    for (let x = 10; x <= 48; x++) alphas.push(r.rgba[(y * W + x) * 4 + 3]!);
  return { p, min: Math.min(...alphas) };
};

const expectSheetAtRest = (p: Puppet) => {
  const rest = rasterOf(p, restPose(p)).rgba;
  for (let i = 0; i < W * H; i++) {
    const front = Number(CUT_SHEET.parts[0]!.pixels.rgba[i * 4 + 3] === 0);
    expect([...rest.subarray(i * 4, i * 4 + 4)]).toEqual([
      ...CUT_SHEET.parts[front]!.pixels.rgba.subarray(i * 4, i * 4 + 4),
    ]);
  }
};

const box = (x0: number, x1: number, y0: number, y1: number, blue: number) => {
  const rgba = new Uint8Array(W * H * 4);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) rgba.set([x * 4, y * 9, blue, 255], (y * W + x) * 4);
  return { width: W, height: H, rgba };
};

const HEADED = {
  hand: box(56, 60, 4, 12, 40),
  head: box(8, 56, 4, 12, 100),
  veil: box(8, 56, 1, 4, 160),
  torso: box(8, 56, 12, 20, 220),
};

const HEAD_SHEET: PuppetSheet = {
  width: W,
  height: H,
  parts: (['hand', 'head', 'veil', 'torso'] as const).map((name) => ({
    name,
    pixels: HEADED[name],
  })),
};

const underlapping = (underlap: Record<string, number>): PuppetSheet => ({
  ...HEAD_SHEET,
  underlap,
});

const HEAD_BONES: Skeleton = {
  bones: [
    { name: 'lean', pivot: [32, 20], tip: [32, 12] },
    { name: 'neck', parent: 'lean', pivot: [32, 12], tip: [32, 2] },
    { name: 'shoulderRight', parent: 'lean', pivot: [58, 12], tip: [58, 4] },
  ],
  skin: { hand: ['shoulderRight'], head: ['neck'], veil: ['neck'], torso: ['lean'] },
};

const textureOf = (p: Puppet, name: string) => p.parts.find((q) => q.name === name)!.pixels.rgba;

describe('a puppet', () => {
  test('weighs each vertex on at most two bones its skin names, totalling 1', () => {
    const p = made(SLEEVE, TWO_BONES);
    const { mesh } = p.parts[0]!;
    expect(mesh.vertices.length).toBeGreaterThan(0);
    const slots = mesh.bones.length / (mesh.vertices.length / 2);
    for (let i = 0; i < mesh.vertices.length / 2; i++) {
      const on = Array.from({ length: slots }, (_, j) => j).filter(
        (j) => mesh.bones[slots * i + j]! >= 0,
      );
      expect(on.length).toBeGreaterThanOrEqual(1);
      expect(on.length).toBeLessThanOrEqual(2);
      expect(Math.abs(on.reduce((s, j) => s + mesh.amounts[slots * i + j]!, 0) - 1)).toBeLessThan(
        1e-12,
      );
      for (const j of on)
        expect(['shoulderRight', 'elbowRight']).toContain(
          p.bones[mesh.bones[slots * i + j]!]!.name,
        );
    }
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
    const slots = bones.length / (vertices.length / 2);
    const leanAt = (x: number, y: number) => {
      const i = [...Array(vertices.length / 2).keys()].find(
        (k) => vertices[2 * k] === x && vertices[2 * k + 1] === y,
      )!;
      return [...Array(slots).keys()]
        .filter((k) => bones[slots * i + k] === lean)
        .reduce((sum, k) => sum + amounts[slots * i + k]!, 0);
    };
    expect(leanAt(9, 39)).toBe(0);
    expect(leanAt(9, 3)).toBe(1);
    expect(leanAt(9, 21)).toBeGreaterThan(0);
    expect(leanAt(9, 21)).toBeLessThan(1);
    expect(p.parts[0]!.pixels.rgba[(10 * w + 14) * 4 + 3]).toBe(255);
    const laid = Uint8Array.from(body);
    for (let i = 0; i < arm.length; i += 4)
      if (arm[i + 3]! > 0) laid.set(arm.subarray(i, i + 4), i);
    expect(rasterOf(p, restPose(p)).rgba).toEqual(laid);
  });

  test("a shoulder flap gives the body only the flap bone's own share, so a hand folded up by the shoulder keeps its weights", () => {
    const flapped = amountsOf(FOLDED.puppet, 0);
    const alone = amountsOf(FOLDED.alone(), 0);
    const of = (m: ReadonlyMap<string, number>, bone: string) => m.get(bone) ?? 0;
    expect([...alone.keys()].filter((at) => !flapped.has(at))).toEqual([]);
    let [worst, part, whole, hands] = [0, 0, 0, 0];
    for (const [at, own] of alone) {
      const here = flapped.get(at) ?? new Map<string, number>();
      worst = Math.max(
        worst,
        Math.abs(of(here, 'upper') + of(here, 'lean') - of(own, 'upper')),
        Math.abs(of(here, 'forearm') - of(own, 'forearm')),
        Math.abs(of(here, 'hand') - of(own, 'hand')),
      );
      const upper = of(own, 'upper');
      if (upper > 0 && upper < 1 && of(here, 'lean') > 0)
        if (of(here, 'upper') > 0) part++;
        else whole++;
      const [x, y] = at.split(',').map(Number) as [number, number];
      if (upper === 0 && y < 30 && Math.hypot(x - 70, y - 30) > FOLDED.flap.cap) hands++;
    }
    expect(worst).toBeLessThan(1e-9);
    expect(part).toBeGreaterThan(0);
    expect(whole).toBeGreaterThan(0);
    expect(hands).toBeGreaterThan(0);
  });

  test('is refused for a skeleton that names what the sheet or itself lacks', () => {
    const refused = (skeleton: Skeleton) => Result.isFailure(puppetOf(SLEEVE, skeleton));
    expect(refused({ ...TWO_BONES, skin: { leg: ['shoulderRight'] } })).toBe(true);
    expect(refused({ ...TWO_BONES, skin: { arm: ['wrist'] } })).toBe(true);
    expect(
      refused({ bones: [{ name: 'a', parent: 'b', pivot: [0, 0], tip: [1, 0] }], skin: {} }),
    ).toBe(true);
  });

  test('two flaps on one part, or a flap on an arm of more than 3 bones, are refused', () => {
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
    const chain = ['lean', 'shoulderRight', 'elbowRight', 'wristRight', 'fingerRight'];
    const arm = (n: number): Skeleton => ({
      bones: [
        { name: 'lean', pivot: [8, 15], tip: [8, 0] },
        ...chain.slice(1, n + 1).map((name, i) => ({
          name,
          parent: chain[i]!,
          pivot: [4, 8 + 2 * i] as const,
          tip: [4, 10 + 2 * i] as const,
        })),
      ],
      skin: { arm: chain.slice(0, n + 1), body: ['lean'] },
      flaps: [flap],
    });
    expect(Result.isSuccess(puppetOf(sheet, arm(3)))).toBe(true);
    const crowded = puppetOf(sheet, arm(4));
    expect(Result.isFailure(crowded) && crowded.failure.reason).toContain('arm of 4 bones');
  });

  test("keeps, revealed by the part in front, the paint the un-matte cleared behind that part's rim", () => {
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
    expect(at(back.pixels.rgba, 22, 8)).toEqual([0, 0, 0, 0]);
    expect(at(back.revealed[0]!.rgba, 22, 8)).toEqual([200, 190, 160, 255]);

    expect(at(back.pixels.rgba, 11, 8)).toEqual([0, 0, 0, 0]);
    expect(at(back.revealed[0]!.rgba, 11, 8)).toEqual([0, 0, 0, 0]);

    expect(at(back.revealed[0]!.rgba, 30, 18)).toEqual([0, 0, 0, 0]);
    expect(back.revealed[1]).toBeUndefined();
    expect(p.parts[0]!.revealed.filter(Boolean)).toEqual([]);
  });

  test("un-mattes a key drawn on the sheet's canvas in place of a part as that part's own rim is un-matted", () => {
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
    const skeleton = { ...TWO_BONES, skin: { arm: ['shoulderRight', 'elbowRight'], body: [] } };
    const at = (r: Uint8Array, x: number, y: number) => [
      ...r.subarray((y * W + x) * 4, (y * W + x) * 4 + 4),
    ];
    const green = [90, 120, 60, 255] as const;
    const rgba = body.slice();
    for (let y = 15; y < 20; y++) for (let x = 28; x < 34; x++) rgba.set(green, (y * W + x) * 4);
    const key = { width: W, height: H, rgba };
    const unmatted = Result.getOrThrow(unmattedKey(sheet, skeleton, 'body', key));
    expect(at(rgba, 11, 8)).toEqual([250, 240, 220, 255]);
    expect(at(unmatted, 11, 8)).toEqual([0, 0, 0, 0]);
    expect(at(made(sheet, skeleton).parts[1]!.pixels.rgba, 11, 8)).toEqual([0, 0, 0, 0]);
    expect(at(unmatted, 30, 18)).toEqual([...green]);
    expect(at(made(sheet, skeleton).parts[1]!.pixels.rgba, 30, 18)).not.toEqual([...green]);
    const { paper: _paper, ...bare } = sheet;
    expect(Result.getOrThrow(unmattedKey(bare, skeleton, 'body', key))).toBe(rgba);
    const refused = (r: Result.Result<Uint8Array, { readonly reason: string }>) =>
      Result.match(r, { onFailure: (e) => e.reason, onSuccess: () => 'made' });
    expect(refused(unmattedKey(sheet, skeleton, 'tail', key))).toBe('the sheet has no part tail');
    expect(refused(unmattedKey(sheet, skeleton, 'body', { ...key, width: W - 1 }))).toBe(
      `the key is ${W - 1}x${H}, the sheet ${W}x${H}`,
    );
  });

  test('un-mattes the light gap between his feet open when the sheet names the part that closes it below his shadow, and keeps it when it does not', () => {
    const [paper, light, ink, tan] = [
      [250, 240, 220],
      [252, 243, 227],
      [20, 12, 8],
      [215, 205, 190],
    ] as const;
    const painted = (colourAt: (x: number, y: number) => Option.Option<ReadonlyArray<number>>) => {
      const rgba = new Uint8Array(W * H * 4);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const c = colourAt(x, y);
          if (Option.isSome(c)) rgba.set([...c.value, 255], (y * W + x) * 4);
        }
      return { width: W, height: H, rgba };
    };
    const feet = painted((x, y) => {
      if (x < 20 || x > 27 || y < 3 || y > 14) return Option.none();
      if (x >= 23 && x <= 24 && y >= 8) return Option.some(light);
      return Option.some(ink);
    });
    const below = painted((x, y) => {
      if (x < 16 || x > 33 || y < 15 || y > 18) return Option.none();
      if (x <= 18 || x >= 31) return Option.some(ink);
      return Option.some(tan);
    });
    const sheet = (shadow: ReadonlyArray<string>): PuppetSheet => ({
      width: W,
      height: H,
      paper,
      shadow,
      parts: [
        { name: 'feet', pixels: feet },
        { name: 'shadow', pixels: below },
      ],
    });
    const skeleton = { ...TWO_BONES, skin: { feet: [], shadow: [] } };
    const alphaAt = (p: Puppet, x: number, y: number) =>
      p.parts[0]!.pixels.rgba[(y * W + x) * 4 + 3];
    expect(alphaAt(made(sheet(['shadow']), skeleton), 23, 14)).toBe(0);
    expect(alphaAt(made(sheet([]), skeleton), 23, 14)).toBe(255);
  });

  test('leaves no seam at a fractional scale between two parts cut along one line that move together', () => {
    const together = seamless({ skirt: ['lean'], shirt: ['lean'] });
    expect(together.min).toBe(255);
    expectSheetAtRest(together.p);

    const apart = seamless({ skirt: ['lean'], shirt: [] });
    expect(apart.p.parts[1]!.pixels.rgba).toEqual(CUT_SHEET.parts[1]!.pixels.rgba);
  });

  test('leaves no seam at a fractional scale between two parts of different skins cut along one line while still, and shows no seal where the front part moved', () => {
    const { p, min } = seamless({ skirt: ['lean'], shirt: [] });
    expect(min).toBe(255);
    expect(p.parts[1]!.seals[0]).toBeDefined();
    expectSheetAtRest(p);

    const stripped: Puppet = { ...p, parts: p.parts.map((part) => ({ ...part, seals: [] })) };
    const turned = { numbers: { lean: 30 }, root: [0, 0] as const, scale: 0.9 };
    expect(rasterOf(p, turned).rgba).toEqual(rasterOf(stripped, turned).rgba);
    const still = { numbers: {}, root: [0, 0] as const, scale: 0.9 };
    expect(rasterOf(p, still).rgba).not.toEqual(rasterOf(stripped, still).rgba);
  });

  test("gives the part behind a part the sheet names for an underlap, of another skin, that part's paint n px under its cut edge and no further, which a turned head shows at its cut", () => {
    const p = made(underlapping({ head: 3 }), HEAD_BONES);
    const expected = Uint8Array.from(HEADED.torso.rgba);
    expected.set(HEADED.head.rgba.subarray(9 * W * 4, 12 * W * 4), 9 * W * 4);
    expect(textureOf(p, 'torso')).toEqual(expected);

    const sheet = new Uint8Array(W * H * 4);
    for (const part of Object.values(HEADED))
      for (let i = 0; i < W * H * 4; i += 4)
        if (part.rgba[i + 3] !== 0) sheet.set(part.rgba.subarray(i, i + 4), i);
    expect(rasterOf(p, restPose(p)).rgba).toEqual(sheet);

    const leastAlpha = (q: Puppet) => {
      const r = rasterOf(q, { ...restPose(q), numbers: { neck: 4 } }).rgba;
      let least = 255;
      for (let y = 9; y <= 12; y++)
        for (let x = 10; x <= 53; x++) least = Math.min(least, r[(y * W + x) * 4 + 3]!);
      return least;
    };
    expect(leastAlpha(p)).toBe(255);
    expect(leastAlpha(made(HEAD_SHEET, HEAD_BONES))).toBe(0);
  });

  test('keeps each texture byte for byte for a sheet that names no underlap', () => {
    for (const p of [made(HEAD_SHEET, HEAD_BONES), made(underlapping({ head: 0 }), HEAD_BONES)])
      for (const name of ['hand', 'head', 'torso'] as const)
        expect(textureOf(p, name)).toEqual(HEADED[name].rgba);
    expect(textureOf(made(underlapping({ head: 3 }), HEAD_BONES), 'torso')).not.toEqual(
      HEADED.torso.rgba,
    );
  });

  test('gives no underlap to a part in front of the named part, or to one of its skin', () => {
    const plain = made(HEAD_SHEET, HEAD_BONES);
    const under = made(underlapping({ head: 3 }), HEAD_BONES);
    for (const name of ['hand', 'veil'])
      expect(textureOf(under, name)).toEqual(textureOf(plain, name));
    expect(textureOf(under, 'torso')).not.toEqual(textureOf(plain, 'torso'));
  });

  test('refuses an underlap that names no part of the sheet, or whose length is not a whole number of 0 or more', () => {
    const reason = (underlap: Record<string, number>) =>
      Result.match(puppetOf(underlapping(underlap), HEAD_BONES), {
        onFailure: (e) => e.reason,
        onSuccess: () => 'made',
      });
    expect(reason({ haed: 3 })).toBe('the underlap names no part haed of the sheet');
    for (const n of [Infinity, -1, 2.5, Number.NaN])
      expect(reason({ head: n })).toBe(
        `head's underlap is ${n} px, not a whole number of 0 or more`,
      );
    expect(reason({ head: 3 })).toBe('made');
  });

  test('a vertex nearest the upper bone does not follow the elbow', () => {
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
    const s = Math.SQRT1_2;
    const chain: ReadonlyArray<Pt> = [
      [14, 16],
      [94, 16],
      [94 - 40 * s, 16 + 40 * s],
      [94 - 70 * s, 16 + 70 * s],
    ];
    const limbs = [
      limb(48, 48, 4, [
        [6, 6],
        [36, 6],
        [36, 36],
      ]),
      limb(48, 48, 4, [
        [6, 6],
        [36, 6],
        [6, 36],
      ]),
      ...[6, 8, 12].map((half) => limb(108, 80, half, chain)),
    ];
    for (const { pixels, bones } of limbs) {
      const p = made(
        { width: pixels.width, height: pixels.height, parts: [{ name: 'arm', pixels }] },
        { bones, skin: { arm: LIMB.slice(0, bones.length) } },
      );
      expect(worstTear(p, 'forearm', slopeTo(p, 'forearm'))).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  test('a turn of any arm bone tears no mesh edge on an arm whose hand rests by the shoulder flap', () => {
    const p = FOLDED.puppet;
    const { cap, reach } = FOLDED.flap;
    const flap = 1.5 / 8 + 1.5 / (reach - cap + 1) + slopeTo(p, 'hand');
    expect(worstTear(p, 'upper', flap)).toBeLessThanOrEqual(1 + 1e-9);
    expect(worstTear(p, 'forearm', slopeTo(p, 'forearm'))).toBeLessThanOrEqual(1 + 1e-9);
    expect(worstTear(p, 'hand', slopeTo(p, 'hand'))).toBeLessThanOrEqual(1 + 1e-9);
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
    const r = rasterOf(p, { ...restPose(p), numbers: { shoulderRight: 90 } }).rgba;
    const i = (8 * W + 22) * 4;
    expect([...r.subarray(i, i + 4)]).toEqual([200, 190, 160, 255]);
  });

  test('rasterOf shows no hole where a turned back part moves out from under a still front part', () => {
    const { arm, body } = rimSheet();
    const built = (paper?: readonly [number, number, number]) =>
      made(
        {
          width: W,
          height: H,
          ...(paper && { paper }),
          parts: [
            { name: 'arm', pixels: { width: W, height: H, rgba: arm } },
            { name: 'body', pixels: { width: W, height: H, rgba: body } },
          ],
        },
        {
          bones: [{ name: 'turn', pivot: S, tip: E }],
          skin: { arm: [], body: ['turn'] },
        },
      );
    const [unmatted, plain] = [built([250, 240, 220]), built()];
    for (const turn of [-15, -10]) {
      const pose = (p: Puppet) => ({ ...restPose(p), numbers: { turn } });
      const [a, b] = [rasterOf(unmatted, pose(unmatted)).rgba, rasterOf(plain, pose(plain)).rgba];
      let lost = 0;
      for (let y = 0; y < 8; y++)
        for (let x = 20; x <= 40; x++) {
          const i = (y * W + x) * 4 + 3;
          lost = Math.max(lost, b[i]! - a[i]!);
        }
      expect(lost).toBe(0);
    }
  });

  test('is deterministic: the same pose gives the same raster', () => {
    const p = made(SLEEVE, TWO_BONES);
    const pose = { ...restPose(p), numbers: { shoulderRight: 12.5, elbowRight: -20 } };
    expect(rasterOf(p, pose).rgba).toEqual(rasterOf(p, pose).rgba);
  });
});
