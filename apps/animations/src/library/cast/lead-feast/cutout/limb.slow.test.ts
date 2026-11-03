import { labOf, rasterOf } from '@manna/film/core';
import { Console, Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { puppetFor } from './puppet.ts';

type Pt = readonly [number, number];
type Puppet = Parameters<typeof rasterOf>[0];
type Raster = ReturnType<typeof rasterOf>;

const SLEEVE_LAB_MEASURED_ON_SINGLE_9 = [90.2, 4.2, 20.5] as const;
const SKIN_LAB_MEASURED_ON_SINGLE_9 = [63.4, 38.9, 46.9] as const;
const INK_L = 20;
const MIXED_CONTACT_PX_OF_TWO_BILINEAR_FOOTPRINTS_AT_1X = 8;
const INK_MIX_ROUNDING_BYTES = 2;

const inverse = (limb: ReturnType<typeof measuredHand>['limb'], elbow: number, wrist: number) => {
  const e = (elbow * Math.PI) / 180,
    angle = ((elbow + wrist) * Math.PI) / 180;
  const { cuff, elbow: pivot } = limb.chain;
  const x = cuff[0] - pivot[0],
    y = cuff[1] - pivot[1];
  const wx = pivot[0] + Math.cos(e) * x - Math.sin(e) * y;
  const wy = pivot[1] + Math.sin(e) * x + Math.cos(e) * y;
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return [c, -s, s, c, cuff[0] - c * wx - s * wy, cuff[1] + s * wx - c * wy];
};
const mapped = (m: ReadonlyArray<number>, x: number, y: number): Pt => [
  m[0]! * x + m[2]! * y + m[4]!,
  m[1]! * x + m[3]! * y + m[5]!,
];

const measuredHand = (puppet: Puppet) => {
  const arm = Option.getOrThrow(
    Option.fromUndefinedOr(puppet.parts.find((p) => p.name === 'armRight')),
  );
  const limb = Option.getOrThrow(Option.fromUndefinedOr(arm.limb));
  const share = (x: number, y: number) => {
    const [bx, by, width, height] = limb.regions.box;
    const i =
      Math.max(0, Math.min(height - 1, y - by)) * width + Math.max(0, Math.min(width - 1, x - bx));
    return limb.regions.shares.getUint8(2 * i + 1) / 255;
  };
  const alpha = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= arm.pixels.width || y >= arm.pixels.height) return 0;
    return arm.pixels.rgba[(y * arm.pixels.width + x) * 4 + 3]! / 255;
  };
  const sample = (sx: number, sy: number, paint: boolean) => {
    const bx = Math.floor(sx - 0.5),
      by = Math.floor(sy - 0.5);
    const fx = sx - 0.5 - bx,
      fy = sy - 0.5 - by;
    let a = 0;
    for (let k = 0; k < 4; k++) {
      const dx = k & 1,
        dy = k >> 1;
      let value = share(bx + dx, by + dy);
      if (paint) value *= alpha(bx + dx, by + dy);
      a += [1 - fx, fx][dx]! * [1 - fy, fy][dy]! * value;
    }
    return a;
  };
  const paintAt = (sx: number, sy: number) => {
    const bx = Math.floor(sx - 0.5),
      by = Math.floor(sy - 0.5);
    const fx = sx - 0.5 - bx,
      fy = sy - 0.5 - by;
    const rgba = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const dx = k & 1,
        dy = k >> 1;
      const a = alpha(bx + dx, by + dy) * [1 - fx, fx][dx]! * [1 - fy, fy][dy]!;
      if (a === 0) continue;
      const i = ((by + dy) * arm.pixels.width + bx + dx) * 4;
      rgba[3]! += a;
      for (let c = 0; c < 3; c++) rgba[c]! += arm.pixels.rgba[i + c]! * a;
    }
    if (rgba[3] === 0) return [0, 0, 0] as const;
    return [
      Math.round(rgba[0]! / rgba[3]!),
      Math.round(rgba[1]! / rgba[3]!),
      Math.round(rgba[2]! / rgba[3]!),
    ] as const;
  };
  const clothAt = (sx: number, sy: number) => {
    const lab = labOf(paintAt(sx, sy));
    return (
      lab[0] >= INK_L &&
      Math.hypot(
        lab[1] - SLEEVE_LAB_MEASURED_ON_SINGLE_9[1],
        lab[2] - SLEEVE_LAB_MEASURED_ON_SINGLE_9[2],
      ) <=
        Math.hypot(
          lab[1] - SKIN_LAB_MEASURED_ON_SINGLE_9[1],
          lab[2] - SKIN_LAB_MEASURED_ON_SINGLE_9[2],
        )
    );
  };
  const inkAt = (sx: number, sy: number, rgb: readonly [number, number, number]) => {
    const source = paintAt(sx, sy);
    const d = source.map((c, k) => c - limb.ink[k]!);
    const square = d.reduce((sum, c) => sum + c * c, 0);
    if (square === 0) return false;
    const weight = d.reduce((sum, c, k) => sum + c * (source[k]! - rgb[k]!), 0) / square;
    if (weight < 1 / 255 || weight > 1) return false;
    return source.every(
      (c, k) => Math.abs(rgb[k]! - (c - weight * d[k]!)) <= INK_MIX_ROUNDING_BYTES,
    );
  };
  return { arm, limb, alpha, sample, clothAt, inkAt };
};

const kindsOf = (r: Raster) => {
  const kinds = new Uint8Array(r.width * r.height);
  for (let i = 0; i < kinds.length; i++) {
    const o = i * 4;
    if (r.rgba[o + 3]! < 128) continue;
    const lab = labOf([r.rgba[o]!, r.rgba[o + 1]!, r.rgba[o + 2]!]);
    kinds[i] = 1;
    if (lab[0] < INK_L) continue;
    kinds[i] = 2;
    if (
      Math.hypot(
        lab[1] - SKIN_LAB_MEASURED_ON_SINGLE_9[1],
        lab[2] - SKIN_LAB_MEASURED_ON_SINGLE_9[2],
      ) <
      Math.hypot(
        lab[1] - SLEEVE_LAB_MEASURED_ON_SINGLE_9[1],
        lab[2] - SLEEVE_LAB_MEASURED_ON_SINGLE_9[2],
      )
    )
      kinds[i] = 3;
  }
  return kinds;
};

const countEdges = (
  r: Raster,
  kinds: Uint8Array,
  hand: ReadonlyArray<number>,
  measured: ReturnType<typeof measuredHand>,
) => {
  let exposed = 0,
    ghost = 0,
    unprotected = 0;
  const raw: Array<Pt> = [];
  const ghostAt: Array<Pt> = [];
  for (let y = 1; y < r.height - 1; y++)
    for (let x = 1; x < r.width - 1; x++) {
      const i = y * r.width + x;
      if (kinds[i] !== 3) continue;
      const q = mapped(hand, x + 0.5, y + 0.5);
      const coverage = measured.sample(q[0], q[1], true);
      if (coverage === 0) {
        ghost++;
        ghostAt.push([x, y]);
        continue;
      }
      const cut = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ].some(([dx, dy]) => {
        const n = (y + dy!) * r.width + x + dx!;
        if (kinds[n] === 1 || kinds[n] === 3) return false;
        const p = mapped(hand, x + dx! + 0.5, y + dy! + 0.5);
        const o = n * 4;
        if (measured.inkAt(p[0], p[1], [r.rgba[o]!, r.rgba[o + 1]!, r.rgba[o + 2]!])) return false;
        if (measured.sample(p[0], p[1], false) >= 0.5 && measured.clothAt(p[0], p[1])) return false;
        return true;
      });
      if (cut) {
        exposed++;
        raw.push([x, y]);
        if (![i - 1, i + 1, i - r.width, i + r.width].some((n) => kinds[n] === 1)) unprotected++;
      }
    }
  return { exposed, ghost, raw, ghostAt, unprotected };
};

const lead = Effect.runPromise(puppetFor('single-9'));
const counts = new Map<string, ReturnType<typeof countEdges>>();
const at = (elbowRight: number, wristRight: number) =>
  Effect.gen(function* () {
    const puppet = yield* Effect.promise(() => lead);
    const key = `${elbowRight}/${wristRight}`;
    return Option.getOrElse(Option.fromUndefinedOr(counts.get(key)), () => {
      const measured = measuredHand(puppet);
      const alone = { ...puppet, parts: [measured.arm] };
      const r = rasterOf(alone, {
        numbers: { elbowRight, wristRight },
        root: puppet.root,
        scale: 1,
      });
      const result = countEdges(
        r,
        kindsOf(r),
        inverse(measured.limb, elbowRight, wristRight),
        measured,
      );
      counts.set(key, result);
      return result;
    });
  });
const poses: Array<Pt> = [];
for (let elbow = 25; elbow <= 120; elbow += 5)
  for (let wrist = -120; wrist <= 120; wrist += 30) poses.push([elbow, wrist]);
for (const elbow of [55, 90, 110]) poses.push([elbow, -0.85 * elbow]);
for (const [elbow, wrist] of poses)
  describe(`single-9 cuff elbow ${elbow} wrist ${wrist}`, () => {
    it.effect('has no uninked hand-skin edge exposed at the cuff', () =>
      Effect.gen(function* () {
        const row = yield* at(elbow, wrist);
        yield* Console.log(
          `cuff ${elbow}/${wrist}: exposed=${row.exposed} ghost=${row.ghost} unprotected=${row.unprotected} bounds=${MIXED_CONTACT_PX_OF_TWO_BILINEAR_FOOTPRINTS_AT_1X}/0/0`,
        );
        if (row.exposed > 0) yield* Console.log('uninked edge coordinates', row.raw.slice(0, 12));
        expect(row.exposed).toBeLessThanOrEqual(MIXED_CONTACT_PX_OF_TWO_BILINEAR_FOOTPRINTS_AT_1X);
        expect(row.unprotected).toBe(0);
      }),
    );
    it.effect('has zero skin pixels outside the posed hand coverage', () =>
      Effect.gen(function* () {
        const row = yield* at(elbow, wrist);
        if (row.ghost > 0) yield* Console.log('zero-coverage skin coordinates', row.ghostAt);
        expect(row.ghost).toBe(0);
      }),
    );
  });
