// The boil of a figure drawn from pixels (a puppet, `canvas/puppet-gl.ts`):
// the house figure boil (twelve ticks a second, a 48-tick loop, three
// harmonics, `SMALL_BOIL`'s 0.6 px, as a vector rig's line crawls,
// `style/rig/parts.ts`) as one smooth displacement field. Each node of a
// lattice every `BOIL_CELL` px wanders round where it stands, its phases its
// own; a pixel is moved by the nodes about it, blended by a smoothstep each
// way, and the figure resampled bilinearly there. The field is a function of
// the tick alone, and loops at 48. Pure.

/** The lattice's spacing, px: the field bends over about a head's width, so a line crawls without kinking. */
export const BOIL_CELL = 24;

/** How far a node wanders, px: the rig's small boil (`style/rig/draw.ts`, `SMALL_BOIL`). */
export const BOIL_AMP = 0.6;

/** The boil's loop, ticks (four seconds at twelve a second). */
export const BOIL_TICKS = 48;

/** Its harmonics: cycles a loop and share of the wander, so a node moves at most about 0.21 of `BOIL_AMP` a tick. */
const CRAWL = [
  [1, 0.58],
  [2, 0.25],
  [3, 0.17],
] as const;

/** A node's phase for one harmonic of one axis, in turns: an integer hash of where it stands, so every node wanders its own way. */
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

/**
 * The field at boil tick `tick` over a lattice `cols` × `rows` whose first
 * node is node (`i0`, `j0`), each node wandering at most `amp` px (the house
 * `BOIL_AMP` unless given; 0 holds every node still): each node's (dx, dy),
 * px, row by row. A function of the tick (taken round the loop), the nodes
 * and the amplitude alone.
 */
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

/** The displacement at `(x, y)` px from the lattice's origin, the nodes about it blended by a smoothstep each way (the shader's own blend, `canvas/puppet-gl.ts`). */
export const boilAt = (
  field: Float32Array,
  cols: number,
  rows: number,
  x: number,
  y: number,
): readonly [number, number] => {
  const [gx, gy] = [x / BOIL_CELL, y / BOIL_CELL];
  const [c0, r0] = [Math.floor(gx), Math.floor(gy)];
  const s = (f: number) => f * f * (3 - 2 * f);
  const [sx, sy] = [s(gx - c0), s(gy - r0)];
  const node = (c: number, r: number, axis: number) =>
    field[
      (Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))) * 2 + axis
    ] ?? 0;
  const at = (axis: number) => {
    const a = node(c0, r0, axis) + (node(c0 + 1, r0, axis) - node(c0, r0, axis)) * sx;
    const b = node(c0, r0 + 1, axis) + (node(c0 + 1, r0 + 1, axis) - node(c0, r0 + 1, axis)) * sx;
    return a + (b - a) * sy;
  };
  return [at(0), at(1)];
};
