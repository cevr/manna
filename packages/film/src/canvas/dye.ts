import { Result } from 'effect';
import type { Raster } from '../core/raster.ts';
import { type Hex, type Ramp, channelsOf } from './colour.ts';

type Lab = readonly [number, number, number];

export const INK_CUT = 15;

export interface Dye {
  readonly from: readonly [number, number, number, number];
  readonly to: readonly [Lab, Lab, Lab, Lab, Lab];
}

const WHITE = [0.95047, 1, 1.08883] as const;
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const labF = (t: number) => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
const labFi = (t: number) => (t * t * t > EPSILON ? t * t * t : (116 * t - 16) / KAPPA);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

type Row = readonly [number, number, number];

const TO_XYZ: readonly [Row, Row, Row] = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];

const TO_RGB: readonly [Row, Row, Row] = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
];

const dot = (row: Row, v: Row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2];

const vec3Of = (row: Row) => `vec3(${row.join(', ')})`;

const labOf = (r: number, g: number, b: number): Lab => {
  const l: Row = [toLinear(r), toLinear(g), toLinear(b)];
  const fx = labF(dot(TO_XYZ[0], l) / WHITE[0]);
  const fy = labF(dot(TO_XYZ[1], l));
  const fz = labF(dot(TO_XYZ[2], l) / WHITE[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

const srgbOfLab = ([L, a, b]: Lab): readonly [number, number, number] => {
  const fy = (L + 16) / 116;
  const xyz: Row = [WHITE[0] * labFi(fy + a / 500), labFi(fy), WHITE[2] * labFi(fy - b / 200)];
  return [
    clamp01(toGamma(dot(TO_RGB[0], xyz))),
    clamp01(toGamma(dot(TO_RGB[1], xyz))),
    clamp01(toGamma(dot(TO_RGB[2], xyz))),
  ];
};

const labOfHex = (hex: Hex): Lab => {
  const [r, g, b] = channelsOf(hex);
  return labOf(r / 255, g / 255, b / 255);
};

export const lightnessOf = (r: number, g: number, b: number): number =>
  labOf(r / 255, g / 255, b / 255)[0];

const rises = (ls: ReadonlyArray<number>) =>
  ls.every((l, i) => i === 0 || l > (ls[i - 1] ?? Infinity));

const labsOf = (r: Ramp): readonly [Lab, Lab, Lab] => [
  labOfHex(r.shade),
  labOfHex(r.base),
  labOfHex(r.light),
];

export const drawnLabs = (drawn: Ramp): Result.Result<readonly [Lab, Lab, Lab], string> => {
  const labs = labsOf(drawn);
  if (!rises([INK_CUT, ...labs.map((c) => c[0]), 100]))
    return Result.fail(
      `the drawn ramp ${drawn.shade} ${drawn.base} ${drawn.light} does not rise in lightness from above the ink cut (L* ${INK_CUT})`,
    );
  return Result.succeed(labs);
};

const clothKnots = (
  [ds, db, dl]: readonly [Lab, Lab, Lab],
  cloth: Ramp,
): Result.Result<Dye, string> => {
  const [s, b, l] = labsOf(cloth);
  if (!rises([INK_CUT, s[0], b[0], l[0]]))
    return Result.fail(
      `the cloth's ramp ${cloth.shade} ${cloth.base} ${cloth.light} does not rise in lightness from above the ink cut (L* ${INK_CUT})`,
    );
  const k = INK_CUT / s[0];
  return Result.succeed({
    from: [INK_CUT, ds[0], db[0], dl[0]],
    to: [[INK_CUT, s[1] * k, s[2] * k], s, b, l, [100, 0, 0]],
  });
};

export const dyeKnots = (drawn: Ramp, cloth: Ramp): Result.Result<Dye, string> =>
  Result.flatMap(drawnLabs(drawn), (labs) => clothKnots(labs, cloth));

const mixLab = (p: Lab, q: Lab, t: number): Lab => [
  p[0] + (q[0] - p[0]) * t,
  p[1] + (q[1] - p[1]) * t,
  p[2] + (q[2] - p[2]) * t,
];

export const dyedRgb = (
  dye: Dye,
  r: number,
  g: number,
  b: number,
): readonly [number, number, number] => {
  const l = lightnessOf(r, g, b);
  const [cut, ls, lb, ll] = dye.from;
  if (l <= cut) return [r, g, b];
  const [c, s, m, li, w] = dye.to;
  const lab =
    l < ls
      ? mixLab(c, s, (l - cut) / (ls - cut))
      : l < lb
        ? mixLab(s, m, (l - ls) / (lb - ls))
        : l < ll
          ? mixLab(m, li, (l - lb) / (ll - lb))
          : mixLab(li, w, clamp01((l - ll) / Math.max(100 - ll, 1e-6)));
  const out = srgbOfLab(lab);
  return [Math.round(out[0] * 255), Math.round(out[1] * 255), Math.round(out[2] * 255)];
};

export const dyePixel = (dye: Dye, rgba: Uint8Array | Uint8ClampedArray, i: number) => {
  const o = i * 4;
  const [r, g, b] = dyedRgb(dye, rgba[o] ?? 0, rgba[o + 1] ?? 0, rgba[o + 2] ?? 0);
  rgba[o] = r;
  rgba[o + 1] = g;
  rgba[o + 2] = b;
};

export const dyedRaster = (dye: Dye, raster: Raster): Raster => {
  const rgba = Uint8Array.from(raster.rgba);
  for (let i = 0; i < raster.width * raster.height; i++) dyePixel(dye, rgba, i);
  return { width: raster.width, height: raster.height, rgba };
};

export const dyeUniforms = (dye: Dye) => ({
  from: Float32Array.from(dye.from),
  to: Float32Array.from(dye.to.flat()),
});

export const DYE_GLSL = `
uniform vec4 dyeFrom; uniform vec3 dyeTo[5];
const vec3 DYE_WHITE = ${vec3Of(WHITE)};
float dyeLinear(float c) { return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
float dyeGamma(float c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1.0 / 2.4) - 0.055; }
float dyeF(float t) { return t > ${EPSILON} ? pow(t, 1.0 / 3.0) : (${KAPPA} * t + 16.0) / 116.0; }
float dyeFi(float t) { return t * t * t > ${EPSILON} ? t * t * t : (116.0 * t - 16.0) / ${KAPPA}; }
vec3 dyeLab(vec3 c) {
  vec3 l = vec3(dyeLinear(c.r), dyeLinear(c.g), dyeLinear(c.b));
  float fx = dyeF(dot(${vec3Of(TO_XYZ[0])}, l) / DYE_WHITE.x);
  float fy = dyeF(dot(${vec3Of(TO_XYZ[1])}, l));
  float fz = dyeF(dot(${vec3Of(TO_XYZ[2])}, l) / DYE_WHITE.z);
  return vec3(116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz));
}
vec3 dyeRgb(vec3 lab) {
  float fy = (lab.x + 16.0) / 116.0;
  vec3 xyz = vec3(DYE_WHITE.x * dyeFi(fy + lab.y / 500.0), dyeFi(fy), DYE_WHITE.z * dyeFi(fy - lab.z / 200.0));
  return clamp(vec3(
    dyeGamma(dot(${vec3Of(TO_RGB[0])}, xyz)),
    dyeGamma(dot(${vec3Of(TO_RGB[1])}, xyz)),
    dyeGamma(dot(${vec3Of(TO_RGB[2])}, xyz))), 0.0, 1.0);
}
vec3 dyed(vec3 c) {
  float l = dyeLab(c).x;
  if (l <= dyeFrom.x) return c;
  vec3 lab;
  if (l < dyeFrom.y) lab = mix(dyeTo[0], dyeTo[1], (l - dyeFrom.x) / (dyeFrom.y - dyeFrom.x));
  else if (l < dyeFrom.z) lab = mix(dyeTo[1], dyeTo[2], (l - dyeFrom.y) / (dyeFrom.z - dyeFrom.y));
  else if (l < dyeFrom.w) lab = mix(dyeTo[2], dyeTo[3], (l - dyeFrom.z) / (dyeFrom.w - dyeFrom.z));
  else lab = mix(dyeTo[3], dyeTo[4], clamp((l - dyeFrom.w) / max(100.0 - dyeFrom.w, 1e-6), 0.0, 1.0));
  return dyeRgb(lab);
}
`;
