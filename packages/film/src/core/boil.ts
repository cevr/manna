export const BOIL_CELL = 24;

export const BOIL_AMP = 0.6;

const BOIL_TICKS = 48;

const CRAWL = [
  [1, 0.58],
  [2, 0.25],
  [3, 0.17],
] as const;

const phaseOf = (i: number, j: number, k: number) => {
  let h =
    Math.imul(i + 4099, 0x9e3779b1) ^
    Math.imul(j + 7919, 0x85ebca77) ^
    Math.imul(k + 31, 0xc2b2ae3d);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

export const boilField = (
  tick: number,
  i0: number,
  j0: number,
  cols: number,
  rows: number,
  amp: number = BOIL_AMP,
): Float32Array => {
  const t = (((Math.floor(tick) % BOIL_TICKS) + BOIL_TICKS) % BOIL_TICKS) / BOIL_TICKS;
  const out = new Float32Array(cols * rows * 2);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      for (let axis = 0; axis < 2; axis++) {
        let v = 0;
        for (let k = 0; k < CRAWL.length; k++) {
          const [cycles, share] = CRAWL[k] ?? [0, 0];
          v += share * Math.sin(2 * Math.PI * (cycles * t + phaseOf(i0 + c, j0 + r, axis * 3 + k)));
        }
        out[(r * cols + c) * 2 + axis] = amp * v;
      }
  return out;
};
