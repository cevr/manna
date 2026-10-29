// The cut rules a member's cut table lays its parts by (`cutParts`,
// @manna/film's part sheet): a box, a sleeve, the hem, a sole. Each is read in
// the kept view's pixels; the table (`table.ts`) moves it into the view's part
// sheet frame. A member's `cutout/cut.ts` calls these with its own points and
// declares none of its own. Pure.

import type { PartRule } from '@manna/film/tools';

/** A point of a kept view, pixels. */
export type Pt = readonly [number, number];

/**
 * A polygon's edge marker past the view's far edge (its right or bottom), in
 * units of `k * FAR`; a coordinate at or below -1 marks its near edge (left or
 * top). No view's pixel lies at `FAR`, so a marker is never a point of the
 * view. The table (`table.ts`) resolves each against the view's frame: `REACH`
 * pixels past its near edge, `k * REACH` past its far edge when the padded
 * view is `REACH` or narrower, and past a wider view by as much as it is wider.
 * The fixed distances keep each slanted edge to a marker at the slope it was
 * cut with.
 */
export const FAR = 100_000;

/** The distance in pixels a marker resolves to: wider than every view the members' cuts were drawn on. */
export const REACH = 400;

/** A box as a polygon, its right and bottom edges outside it. */
export const box = (x0: number, y0: number, x1: number, y1: number): PartRule => ({
  polygon: [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ],
});

/** The rows a sleeve's polygon covers: from its shoulder joint's row down past its cuff. */
export interface Sleeve {
  /** The sleeve's inner edge, top to bottom: (x, y) knots from above its cap down to its cuff. */
  readonly inner: ReadonlyArray<Pt>;
  /** Its shoulder joint and the cap's radius round it. */
  readonly shoulder: Pt;
  readonly cap: number;
  /** The side it hangs on, as the viewer sees it. */
  readonly side: 'left' | 'right';
}

/** The inner edge's x at row `y`, held flat past its ends. */
const innerAt = (inner: ReadonlyArray<Pt>, y: number) => {
  const first = inner[0] ?? [0, 0];
  if (y <= first[1]) return first[0];
  for (let k = 1; k < inner.length; k++) {
    const [x0, y0] = inner[k - 1] ?? first;
    const [x1, y1] = inner[k] ?? first;
    if (y <= y1) return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
  }
  return (inner[inner.length - 1] ?? first)[0];
};

/** The inner edge's knots below row `y`, with its point at `y` first. */
const edgeFrom = (inner: ReadonlyArray<Pt>, y: number): Pt[] => [
  [innerAt(inner, y), y],
  ...inner.filter((p) => p[1] > y),
];

/**
 * A sleeve's rules: below its shoulder joint, every pixel on its side of the
 * inner edge down to the edge's last knot; above it, the cap round the joint.
 * Its `unless` keeps the cap off the far side of the inner edge.
 */
export const sleeve = (s: Sleeve) => {
  // the view's edge on the sleeve's own side, and past the inner edge on the other
  const [out, across] = { left: [-1, FAR] as const, right: [FAR, -1] as const }[s.side];
  const bottom = (s.inner[s.inner.length - 1] ?? s.shoulder)[1];
  const top = (s.inner[0] ?? s.shoulder)[1];
  const below = edgeFrom(s.inner, s.shoulder[1]);
  const whole = edgeFrom(s.inner, top);
  const take: PartRule[] = [
    { polygon: [[out, s.shoulder[1]], ...below, [out, bottom]] },
    { disc: { c: s.shoulder, r: s.cap } },
  ];
  const unless: PartRule[] = [{ polygon: [[across, top], ...whole, [across, bottom]] }];
  return { take, unless };
};

/** A hem's line: its row at the sides, the column where it is lowest, how far below the row it drops there, and how far to either side it rises back to the row. */
export type Hem = readonly [hem: number, middle: number, drop: number, reach: number];

/** Below the hem: the hem's line, lowest at `middle` (`drop` below `hem` there, rising to `hem` `reach` to either side), and every row under it. */
export const belowHem = (hem: number, middle: number, drop: number, reach: number): PartRule => ({
  polygon: [
    [-1, hem],
    [middle - reach, hem],
    [middle, hem + drop],
    [middle + reach, hem],
    [FAR, hem],
    [FAR, FAR * 2],
    [-1, FAR * 2],
  ],
});

/** Above the hem: every row over it. */
export const aboveHem = (hem: number, middle: number, drop: number, reach: number): PartRule => ({
  polygon: [
    [-1, -1],
    [FAR, -1],
    [FAR, hem],
    [middle + reach, hem],
    [middle, hem + drop],
    [middle - reach, hem],
    [-1, hem],
  ],
});

/** A sole's lowest ink by columns: `[first, last, row]`, each run of columns whose lowest dark pixel (L* < 60) lies on `row`, read off the kept view. */
export type SoleRuns = ReadonlyArray<readonly [number, number, number]>;

/**
 * Under a sandal's sole: every pixel below its column's lowest ink, and
 * every column past the sole's ends. The ground shadow's lavender there is
 * the shadow's, so a lifted foot carries none of it. A step at each column's
 * edge, so no pixel centre lies on it.
 */
export const underSole = (runs: SoleRuns): PartRule => {
  const first = runs[0]?.[0] ?? 0;
  const last = (runs[runs.length - 1]?.[1] ?? 0) + 1;
  return {
    polygon: [
      [-FAR, -FAR],
      [first, -FAR],
      ...runs.flatMap(([a, b, row]): Pt[] => [
        [a, row + 1],
        [b + 1, row + 1],
      ]),
      [last, -FAR],
      [FAR, -FAR],
      [FAR, FAR * 2],
      [-FAR, FAR * 2],
    ],
  };
};
