/* oxlint-disable typescript/no-non-null-assertion -- independent raster oracle indexes bounded pixel buffers */
import { labOf, type rasterOf } from '@manna/film/core';
import { Option } from 'effect';

type Pt = readonly [number, number];
type Puppet = Parameters<typeof rasterOf>[0];
type Raster = ReturnType<typeof rasterOf>;

const INK_L = 20;

/** Independent rigid-chain oracle: rotate cuff about elbow, then hand about the posed cuff. */
export const inverse = (
  measured: ReturnType<typeof measuredHand>,
  elbow: number,
  wrist: number,
) => {
  const e = (elbow * Math.PI) / 180,
    angle = ((elbow + wrist) * Math.PI) / 180;
  const { elbow: pivot } = measured.limb.chain;
  const cuff = measured.wrist;
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

export const measuredHand = (puppet: Puppet, name: string) => {
  const arm = Option.getOrThrow(Option.fromUndefinedOr(puppet.parts.find((p) => p.name === name)));
  const limb = Option.getOrThrow(Option.fromUndefinedOr(arm.limb));
  const wrist = Option.getOrThrow(
    Option.fromUndefinedOr(puppet.bones.find((b) => b.name === limb.bones[2])),
  ).pivot;
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
  const { cloth: CLOTH, skin: SKIN } = references(arm.pixels, limb);
  const clothAt = (sx: number, sy: number) => {
    const lab = labOf(paintAt(sx, sy));
    return (
      lab[0] >= INK_L &&
      Math.hypot(lab[1] - CLOTH[1], lab[2] - CLOTH[2]) <=
        Math.hypot(lab[1] - SKIN[1], lab[2] - SKIN[2])
    );
  };
  const inkAt = (sx: number, sy: number, rgb: readonly [number, number, number]) => {
    const source = paintAt(sx, sy);
    const d = source.map((c, k) => c - limb.ink[k]!);
    const square = d.reduce((sum, c) => sum + c * c, 0);
    if (square === 0) return false;
    const weight = d.reduce((sum, c, k) => sum + c * (source[k]! - rgb[k]!), 0) / square;
    if (weight < 1 / 255 || weight > 1) return false;
    // A filtered ink edge need not be L* <20. Recognise its measured ink
    // mixed with the source colour, within two bytes of rounding error.
    return source.every((c, k) => Math.abs(rgb[k]! - (c - weight * d[k]!)) <= 2);
  };
  return { arm, limb, wrist, alpha, sample, clothAt, inkAt, cloth: CLOTH, skin: SKIN };
};

/** Paper, ink, cloth and skin in the rendered result, independent of source ownership. */
export const kindsOf = (r: Raster, measured: ReturnType<typeof measuredHand>) => {
  const { cloth: CLOTH, skin: SKIN } = measured;
  const kinds = new Uint8Array(r.width * r.height);
  for (let i = 0; i < kinds.length; i++) {
    const o = i * 4;
    if (r.rgba[o + 3]! < 128) continue;
    const lab = labOf([r.rgba[o]!, r.rgba[o + 1]!, r.rgba[o + 2]!]);
    kinds[i] = 1;
    if (lab[0] < INK_L) continue;
    kinds[i] = 2;
    if (
      Math.hypot(lab[1] - SKIN[1], lab[2] - SKIN[2]) <
      Math.hypot(lab[1] - CLOTH[1], lab[2] - CLOTH[2])
    )
      kinds[i] = 3;
  }
  return kinds;
};

export const countEdges = (
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
      // A native skin/bottle paint contact stays native. Every other skin
      // contact with cloth or paper needs ink, including a cut moved inward
      // by the sleeve lip where the original source is still hand-owned.
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

/** Each arm's own opaque cuff-axis paint: median cloth before the opening,
 * median skin beyond it. Chroma ignores coloured light and shade. No cast
 * member's palette is shared with another arm. */
const references = (pixels: Raster, limb: NonNullable<Puppet['parts'][number]['limb']>) => {
  const { cuff, elbow, fore } = limb.chain;
  const dx = (cuff[0] - elbow[0]) / fore,
    dy = (cuff[1] - elbow[1]) / fore;
  const labs = (from: number, to: number) => {
    const found: Array<readonly [number, number, number]> = [];
    for (let s = from; s <= to; s += 0.5) {
      const x = Math.floor(cuff[0] + s * dx),
        y = Math.floor(cuff[1] + s * dy);
      if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) continue;
      const i = (y * pixels.width + x) * 4;
      if (pixels.rgba[i + 3]! < 128) continue;
      const lab = labOf([pixels.rgba[i]!, pixels.rgba[i + 1]!, pixels.rgba[i + 2]!]);
      if (lab[0] >= INK_L) found.push(lab);
    }
    return found;
  };
  const median = (values: ReadonlyArray<number>) =>
    Option.getOrThrow(
      Option.fromUndefinedOr(values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]),
    );
  const centre = (
    values: ReadonlyArray<readonly [number, number, number]>,
  ): readonly [number, number, number] => [
    median(values.map((c) => c[0])),
    median(values.map((c) => c[1])),
    median(values.map((c) => c[2])),
  ];
  const cloth = centre(labs(-2 * limb.inkWidth, -limb.inkWidth));
  const hand = labs(0, Math.max(limb.stations.cuff.inner, limb.stations.cuff.outer));
  const distinct = hand.toSorted(
    (a, b) =>
      Math.hypot(b[1] - cloth[1], b[2] - cloth[2]) - Math.hypot(a[1] - cloth[1], a[2] - cloth[2]),
  );
  const skin = centre(distinct.slice(0, Math.max(1, Math.ceil(distinct.length / 3))));
  return { cloth, skin };
};

/** Acceptance D: extra light, bare edge pixels near the elbow or posed cuff.
 * Uses the entire canvas, so moving a tear cannot move it outside a crop. */
export const bareEdges = (r: Raster, measured: ReturnType<typeof measuredHand>, elbow: number) => {
  const { elbow: e, fore } = measured.limb.chain;
  const cuff = measured.wrist;
  const a = (elbow * Math.PI) / 180,
    dx = cuff[0] - e[0],
    dy = cuff[1] - e[1];
  const wx = e[0] + Math.cos(a) * dx - Math.sin(a) * dy;
  const wy = e[1] + Math.sin(a) * dx + Math.cos(a) * dy;
  let count = 0;
  for (let y = 1; y < r.height - 1; y++)
    for (let x = 1; x < r.width - 1; x++) {
      if (
        (x - e[0]) ** 2 + (y - e[1]) ** 2 > (0.6 * fore) ** 2 &&
        (x - wx) ** 2 + (y - wy) ** 2 > (0.35 * fore) ** 2
      )
        continue;
      const i = y * r.width + x,
        o = i * 4;
      if (
        r.rgba[o + 3]! < 128 ||
        0.2126 * r.rgba[o]! + 0.7152 * r.rgba[o + 1]! + 0.0722 * r.rgba[o + 2]! < 90
      )
        continue;
      if ([i - 1, i + 1, i - r.width, i + r.width].some((n) => r.rgba[n * 4 + 3]! < 128)) count++;
    }
  return count;
};

/** Acceptance E's OKLab colour distance and silhouette overlap in one box. */
export const colourMatch = (
  painted: Raster,
  stroke: Raster,
  box: readonly [number, number, number, number],
) => {
  const oklab = (r: number, g: number, b: number): readonly [number, number, number] => {
    const linear = (c: number) => {
      const v = c / 255;
      if (v <= 0.04045) return v / 12.92;
      return ((v + 0.055) / 1.055) ** 2.4;
    };
    const R = linear(r),
      G = linear(g),
      B = linear(b);
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  };
  let inter = 0,
    union = 0,
    total = 0,
    count = 0;
  for (let y = box[1]; y < box[3]; y++)
    for (let x = box[0]; x < box[2]; x++) {
      const i = (y * painted.width + x) * 4;
      const a = painted.rgba[i + 3]! >= 128,
        b = stroke.rgba[i + 3]! >= 128;
      if (a || b) union++;
      if (!a || !b) continue;
      inter++;
      if (
        0.2126 * painted.rgba[i]! + 0.7152 * painted.rgba[i + 1]! + 0.0722 * painted.rgba[i + 2]! <
        90
      )
        continue;
      const p = oklab(painted.rgba[i]!, painted.rgba[i + 1]!, painted.rgba[i + 2]!);
      const q = oklab(stroke.rgba[i]!, stroke.rgba[i + 1]!, stroke.rgba[i + 2]!);
      total += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      count++;
    }
  return { iou: inter / Math.max(1, union), de: total / Math.max(1, count) };
};

/** New interior ink near the fixed shoulder, compared with the painted
 * whole figure. The rigid hand and moving forearm support (including their
 * measured ink/filter footprints) are excluded: their outlines are not a
 * fixed shoulder seam. The remaining count has no allowance. */
export const shoulderInk = (
  engine: Raster,
  painted: Raster,
  measured: ReturnType<typeof measuredHand>,
  elbow: number,
  offset: Pt = [0, 0],
  wrist = 0,
) => {
  const { shoulder, upper, fore, elbow: e } = measured.limb.chain;
  const sx = shoulder[0] + offset[0],
    sy = shoulder[1] + offset[1];
  const a = (elbow * Math.PI) / 180,
    dx = measured.wrist[0] - e[0],
    dy = measured.wrist[1] - e[1];
  const wx = e[0] + Math.cos(a) * dx - Math.sin(a) * dy + offset[0];
  const wy = e[1] + Math.sin(a) * dx + Math.cos(a) * dy + offset[1];
  const handFrame = inverse(measured, elbow, wrist);
  const foreFrame = inverse(measured, elbow, 0);
  const dfx = (measured.limb.chain.cuff[0] - e[0]) / fore;
  const dfy = (measured.limb.chain.cuff[1] - e[1]) / fore;
  const foreWidth =
    Math.max(
      measured.limb.stations.elbowFore.inner,
      measured.limb.stations.elbowFore.outer,
      measured.limb.stations.cuff.inner,
      measured.limb.stations.cuff.outer,
      ...measured.limb.outer.widths,
      ...measured.limb.inner.widths,
    ) +
    measured.limb.inkWidth +
    Math.SQRT2;
  const ink = (r: Raster, i: number) =>
    r.rgba[i * 4 + 3]! >= 128 &&
    labOf([r.rgba[i * 4]!, r.rgba[i * 4 + 1]!, r.rgba[i * 4 + 2]!])[0] < INK_L;
  const near = (x: number, y: number, reach: number, hit: (i: number) => boolean) => {
    const radius = Math.ceil(reach);
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > reach * reach) continue;
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= engine.width || yy >= engine.height) return true;
        if (hit(yy * engine.width + xx)) return true;
      }
    return false;
  };
  const moving = (x: number, y: number) => {
    const handRadius = Math.max(
      0.35 * fore,
      measured.limb.stations.cuff.inner + measured.limb.inkWidth,
      measured.limb.stations.cuff.outer + measured.limb.inkWidth,
    );
    if ((x - wx) ** 2 + (y - wy) ** 2 <= handRadius ** 2) return true;
    const h = mapped(handFrame, x + 0.5 - offset[0], y + 0.5 - offset[1]);
    if (measured.sample(h[0], h[1], true) > 0) return true;
    const q = mapped(foreFrame, x + 0.5 - offset[0], y + 0.5 - offset[1]);
    const rx = q[0] - e[0],
      ry = q[1] - e[1],
      u = rx * dfx + ry * dfy;
    return u >= -foreWidth && u <= fore + foreWidth && Math.abs(rx * dfy - ry * dfx) <= foreWidth;
  };
  const handFringe = (x: number, y: number) => {
    const q = mapped(handFrame, x + 0.5 - offset[0], y + 0.5 - offset[1]);
    const radius = measured.limb.inkWidth / 2 + Math.SQRT2;
    const reach = Math.ceil(radius);
    for (let dx = -reach; dx <= reach; dx++)
      for (let dy = -reach; dy <= reach; dy++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        if (measured.sample(q[0] + dx, q[1] + dy, true) > 0) return true;
      }
    return false;
  };
  let count = 0;
  const radius = 0.6 * upper,
    width = measured.limb.inkWidth;
  for (
    let y = Math.max(0, Math.floor(sy - radius));
    y <= Math.min(engine.height - 1, sy + radius);
    y++
  )
    for (
      let x = Math.max(0, Math.floor(sx - radius));
      x <= Math.min(engine.width - 1, sx + radius);
      x++
    ) {
      if ((x - sx) ** 2 + (y - sy) ** 2 > radius * radius || moving(x, y)) continue;
      const i = y * engine.width + x;
      if (!ink(engine, i) || painted.rgba[i * 4 + 3]! < 128) continue;
      if (near(x, y, width + 1, (j) => engine.rgba[j * 4 + 3]! < 128)) continue;
      if (near(x, y, width / 2 + 1, (j) => ink(painted, j))) continue;
      if (handFringe(x, y)) continue;
      count++;
    }
  return count;
};
