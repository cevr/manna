import type { MeshLabels } from './mesh/labels.ts';

/**
 * The feast lead's mesh labels (cast-sheet/views), over his Meshy mesh stood
 * at 656/189 heads. The hairline sits on the forehead at 3.11 across the
 * front, drops past the temples to the top of the ears and, behind them, to
 * the nape. The neckline is the mesh's own collar, lowest at the front. The
 * mantle and its hem are the code-built figure's planes: the mantle covers
 * the left shoulder and crosses the chest to the right hip, front and back.
 * The sandals are everything below the ankles. The sash's bulge, the knot
 * from 1.47 to 1.66, is tunic all round.
 */
export const leadFeastLabels: MeshLabels = {
  hairline: {
    axis: [0, 0],
    knots: [
      [0, 3.11],
      [45, 3.1],
      [70, 2.92],
      [100, 2.86],
      [125, 2.55],
      [180, 2.51],
    ],
  },
  neckline: {
    axis: [0, 0],
    knots: [
      [0, 2.285],
      [20, 2.29],
      [60, 2.35],
      [95, 2.4],
      [120, 2.42],
      [180, 2.35],
    ],
  },
  hand: 0,
  mantle: {
    edges: [{ point: [0.15, 2.36, 0.3], normal: [1.03, -0.6, -0.3] }],
    hem: { point: [0, 0.68, 0], normal: [-0.26, 1, -0.33] },
  },
  ankle: { point: [0, 0.24, 0], normal: [0, -1, 0] },
  bulge: {
    top: { point: [0, 1.66, 0], normal: [0, -1, 0] },
    bottom: { point: [0, 1.47, 0], normal: [0, 1, 0] },
  },
};
