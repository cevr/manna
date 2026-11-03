const POW2 = ((): Float64Array => {
  const out = new Float64Array(2046);
  out[1022] = 1;
  for (let k = 1; k <= 1023; k++) out[1022 + k] = (out[1021 + k] ?? 0) * 2;
  for (let k = 1; k <= 1022; k++) out[1022 - k] = (out[1023 - k] ?? 0) / 2;
  return out;
})();

const pow2 = (k: number): number => POW2[k + 1022] ?? 0;

const TWO_M54 = 1 / 18014398509481984;

const scaled = (y: number, k: number): number => {
  if (k > 1023) return y * 2 * pow2(k - 1);
  if (k < -1022) return y * pow2(k + 54) * TWO_M54;
  return y * pow2(k);
};

const exponentOf = (x: number): number => {
  let lo = -1022;
  let hi = 1023;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pow2(mid) <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

const PIO2 = Math.PI / 2;

const S1 = -1.6666666666666632e-1;
const S2 = 8.33333333332249e-3;
const S3 = -1.984126982985795e-4;
const S4 = 2.7557313707070068e-6;
const S5 = -2.5050760253406863e-8;
const S6 = 1.58969099521155e-10;

const kernelSin = (r: number): number => {
  const z = r * r;
  return r + z * r * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))));
};

const C1 = 4.16666666666666e-2;
const C2 = -1.388888888887411e-3;
const C3 = 2.480158728947673e-5;
const C4 = -2.7557314351390663e-7;
const C5 = 2.087572321298175e-9;
const C6 = -1.1359647557788195e-11;

const kernelCos = (r: number): number => {
  const z = r * r;
  const tail = z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  const half = 0.5 * z;
  const w = 1 - half;
  return w + (1 - w - half + tail);
};

export const sinTurn = (t: number): number => {
  const quarters = (t - Math.floor(t)) * 4;
  const q = Math.round(quarters);
  const r = (quarters - q) * PIO2;
  switch (q) {
    case 1:
      return kernelCos(r);
    case 2:
      return 0 - kernelSin(r);
    case 3:
      return 0 - kernelCos(r);
    default:
      return kernelSin(r);
  }
};

export const cosTurn = (t: number): number => {
  const quarters = (t - Math.floor(t)) * 4;
  const q = Math.round(quarters);
  const r = (quarters - q) * PIO2;
  switch (q) {
    case 1:
      return 0 - kernelSin(r);
    case 2:
      return 0 - kernelCos(r);
    case 3:
      return kernelSin(r);
    default:
      return kernelCos(r);
  }
};

const LN2_HI = 6.931471803691238e-1;
const LN2_LO = 1.9082149292705877e-10;
const INV_LN2 = 1.4426950408889634;
const EXP_OVER = 709.782712893384;
const EXP_UNDER = -745.1332191019411;

const P1 = 1.6666666666666602e-1;
const P2 = -2.7777777777015593e-3;
const P3 = 6.613756321437934e-5;
const P4 = -1.6533902205465252e-6;
const P5 = 4.1381367970572385e-8;

export const exp = (x: number): number => {
  if (Number.isNaN(x)) return x;
  if (x > EXP_OVER) return Infinity;
  if (x < EXP_UNDER) return 0;
  const k = Math.round(x * INV_LN2);
  const hi = x - k * LN2_HI;
  const lo = k * LN2_LO;
  const r = hi - lo;
  const t = r * r;
  const c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  return scaled(1 - (lo - (r * c) / (2 - c) - hi), k);
};

export const exp2 = (x: number): number => {
  if (!Number.isFinite(x)) return exp(x);
  const k = Math.round(x);
  return scaled(exp((x - k) * Math.LN2), k);
};

const LG1 = 6.666666666666735e-1;
const LG2 = 3.999999999940942e-1;
const LG3 = 2.857142874366239e-1;
const LG4 = 2.2222198432149784e-1;
const LG5 = 1.818357216161805e-1;
const LG6 = 1.5313837699209373e-1;
const LG7 = 1.4798198605116586e-1;

const MIN_NORMAL = pow2(-1022);

const logNormal = (x: number): number => {
  let k = exponentOf(x);
  let m = x / pow2(k);
  if (m > Math.SQRT2) {
    m /= 2;
    k += 1;
  }
  const f = m - 1;
  const s = f / (2 + f);
  const z = s * s;
  const w = z * z;
  const even = w * (LG2 + w * (LG4 + w * LG6));
  const odd = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const half = 0.5 * f * f;
  return k * LN2_HI - (half - (s * (half + odd + even) + k * LN2_LO) - f);
};

export const log = (x: number): number => {
  if (Number.isNaN(x) || x < 0) return Number.NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return x;
  if (x < MIN_NORMAL) return logNormal(x * 18014398509481984) - 54 * Math.LN2;
  return logNormal(x);
};

const FACTORIAL_INVERSES: ReadonlyArray<number> = Array.from({ length: 15 }, (_, i) => {
  let f = 1;
  for (let n = 2; n <= i + 1; n++) f *= n;
  return 1 / f;
});

const expm1Near0 = (r: number): number => {
  let sum = 0;
  for (let i = FACTORIAL_INVERSES.length - 1; i >= 0; i--)
    sum = sum * r + (FACTORIAL_INVERSES[i] ?? 0);
  return sum * r;
};

export const tanh = (x: number): number => {
  if (Number.isNaN(x)) return x;
  const a = Math.abs(x);
  if (a > 22) return Math.sign(x);
  const r = -2 * a;
  const t = r > -0.35 ? expm1Near0(r) : exp(r) - 1;
  const z = -t / (t + 2);
  return x < 0 ? -z : z;
};

const DB_LN = Math.LN10 / 20;

export const dbToGain = (db: number): number => exp(db * DB_LN);
