// The series lead's kept views cut into parts (`cutParts`, @manna/film's
// part sheet): each part his own pixels, front to back, so that a part can move
// while every pixel at rest stays the sheet's. Parts are named from his own
// side: `armRight` is his right arm, on the viewer's left from in front. His
// face, ears and hands are taken by his part labels (`rig/labels.ts`, read by
// the tracer's colour classes, `rig/trace.ts`); the cuts the sheet does not ink
// (each sleeve's inner edge, a soft crease; the sash's band, knot and ends; the
// hem; each sandal) are polygons and discs read off 2-4x crops of the view. The
// front's lines are the world-proto round 2 cut's (`src/r2/parts.ts`), the
// three-quarter view's are read new. A sleeve takes its cap (a disc round its
// shoulder) above its shoulder, the rest of the shoulder the torso's; below the
// hem the sandals, and the ground shadow behind them is a part of its own. The
// paper between his sandals is the view's ground, owned by no part. Pure.

import type { PartCut, PartCutOptions, PartRule } from '@manna/film/tools';
import { LABELS } from '../rig/labels.ts';
import { CLASSES } from '../rig/trace.ts';

type Pt = readonly [number, number];

/** Each view's joints, view pixels: a shoulder at the sleeve's middle a little below the shoulder's curve, an elbow at the sleeve's middle on its axis. */
export const JOINTS = {
  front: {
    shoulderRight: [43, 250],
    elbowRight: [37, 335],
    shoulderLeft: [204, 250],
    elbowLeft: [210, 335],
  },
  threeQuarterLeft: {
    shoulderRight: [36, 250],
    elbowRight: [28, 335],
    shoulderLeft: [172, 250],
    elbowLeft: [178, 335],
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Pt>>>>;

/** A box as a polygon, its right and bottom edges outside it. */
const box = (x0: number, y0: number, x1: number, y1: number): PartRule => ({
  polygon: [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ],
});

/** Wider than any view: a polygon's edge past the view's own. */
const FAR = 400;

/** The rows a sleeve's polygon covers: from its shoulder joint's row down past its cuff. */
interface Sleeve {
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
const sleeve = (s: Sleeve) => {
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

/** Below the hem: the hem's line, lowest at `middle` (`drop` below `hem` there, rising to `hem` `reach` to either side), and every row under it. */
const belowHem = (hem: number, middle: number, drop: number, reach: number): PartRule => ({
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
const aboveHem = (hem: number, middle: number, drop: number, reach: number): PartRule => ({
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

/** From in front: the world-proto round 2 cut's lines. */
const FRONT_HEM = [618, 123, 4, 90] as const;
const FRONT_RIGHT: Sleeve = {
  // his right sleeve (the viewer's left): its inner edge, a soft crease the sheet paints without ink
  inner: [
    [50, 226],
    [50, 228],
    [53, 240],
    [56, 260],
    [58, 300],
    [60, 340],
    [62, 380],
    [63, 408],
    [63, 409],
  ],
  shoulder: JOINTS.front.shoulderRight,
  cap: 13,
  side: 'left',
};
const FRONT_LEFT: Sleeve = {
  // his left sleeve (the viewer's right, under the mantle): its inner edge, a dark teal crease
  inner: [
    [200, 226],
    [199, 240],
    [190, 290],
    [186, 330],
    [189, 400],
    [191.4, 408],
    [191.6, 409],
  ],
  shoulder: JOINTS.front.shoulderLeft,
  cap: 13,
  side: 'right',
};
const frontRight = sleeve(FRONT_RIGHT);
const frontLeft = sleeve(FRONT_LEFT);

const FRONT: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: [
        ...frontRight.take,
        { label: 'handNear' },
        { disc: { c: [29.5, 429], r: 29 } },
        // the cuff's end beside the hand
        box(-1, 395, 36, 463),
      ],
      unless: frontRight.unless,
      pivot: JOINTS.front.shoulderRight,
    },
    {
      name: 'armLeft',
      take: [
        ...frontLeft.take,
        { label: 'handFar' },
        { disc: { c: [216.5, 428.5], r: 28.5 } },
        box(211, 395, FAR, 463),
      ],
      unless: frontLeft.unless,
      pivot: JOINTS.front.shoulderLeft,
    },
    {
      // above the chin, and his face's skin down his neck to the collar
      name: 'head',
      take: [box(-1, -1, FAR, 192), { label: 'face' }, { label: 'earNear' }, { label: 'earFar' }],
    },
    {
      // the band's rows, the knot and the two hanging ends
      name: 'sash',
      take: [
        box(-1, 346, FAR, 369),
        { disc: { c: [124, 357], r: 15 } },
        {
          polygon: [
            [101, 366],
            [146, 366],
            [148, 430],
            [152, 470],
            [153, 533],
            [127, 538],
            [124, 498],
            [101, 492],
          ],
        },
      ],
    },
    {
      name: 'footRight',
      take: [
        {
          polygon: [
            [40, 612],
            [100, 612],
            [104, 630],
            [108, 648],
            [107, 664],
            [25, 664],
            [20, 652],
            [26, 636],
            [38, 620],
          ],
        },
      ],
      unless: [aboveHem(...FRONT_HEM)],
    },
    {
      name: 'footLeft',
      take: [
        {
          polygon: [
            [142, 612],
            [205, 612],
            [212, 622],
            [222, 638],
            [228, 652],
            [225, 664],
            [138, 664],
            [136, 648],
            [140, 630],
          ],
        },
      ],
      unless: [aboveHem(...FRONT_HEM)],
    },
    { name: 'shadow', take: [belowHem(...FRONT_HEM)] },
    { name: 'robe', take: [box(-1, 369, FAR, FAR * 2)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR * 2)] },
  ],
};

/** Turned three-quarters to the viewer's left: read off 3-4x crops of the view. */
const TURNED_HEM = [618, 112, 4, 90] as const;
const TURNED_RIGHT: Sleeve = {
  // his near sleeve (the viewer's left): its inner edge, a soft shaded crease
  inner: [
    [47, 226],
    [46, 260],
    [44, 300],
    [42, 340],
    [41, 380],
    [40, 408],
    [40, 409],
  ],
  shoulder: JOINTS.threeQuarterLeft.shoulderRight,
  cap: 11,
  side: 'left',
};
const TURNED_LEFT: Sleeve = {
  // his far sleeve (the viewer's right, of his mantle's teal): its inner edge, a dark teal crease
  inner: [
    [153, 226],
    [151, 240],
    [150, 280],
    [149, 330],
    [150, 380],
    [151, 408],
    [151, 409],
  ],
  shoulder: JOINTS.threeQuarterLeft.shoulderLeft,
  cap: 13,
  side: 'right',
};
const turnedRight = sleeve(TURNED_RIGHT);
const turnedLeft = sleeve(TURNED_LEFT);

const THREE_QUARTER_LEFT: PartCut = {
  parts: [
    {
      name: 'armRight',
      take: [...turnedRight.take, { label: 'handNear' }, { disc: { c: [21.5, 429], r: 24 } }],
      unless: turnedRight.unless,
      pivot: JOINTS.threeQuarterLeft.shoulderRight,
    },
    {
      name: 'armLeft',
      take: [...turnedLeft.take, { label: 'handFar' }, { disc: { c: [183.5, 429], r: 24.5 } }],
      unless: turnedLeft.unless,
      pivot: JOINTS.threeQuarterLeft.shoulderLeft,
    },
    {
      // above the chin, and his face's skin (his ear's with it) down his neck to the collar
      name: 'head',
      take: [box(-1, -1, FAR, 190), { label: 'face' }],
    },
    {
      name: 'sash',
      take: [
        box(-1, 345, FAR, 369),
        { disc: { c: [88.5, 358.5], r: 15 } },
        {
          polygon: [
            [59, 368],
            [110, 368],
            [111, 450],
            [112, 536],
            [81, 538],
            [80, 478],
            [58, 478],
            [57, 420],
          ],
        },
      ],
    },
    {
      name: 'footRight',
      take: [
        {
          polygon: [
            [30, 612],
            [90, 612],
            [95, 630],
            [99, 650],
            [98, 664],
            [8, 664],
            [5, 650],
            [14, 632],
          ],
        },
      ],
      unless: [aboveHem(...TURNED_HEM)],
    },
    {
      name: 'footLeft',
      take: [
        {
          polygon: [
            [128, 612],
            [185, 612],
            [195, 630],
            [204, 648],
            [204, 664],
            [119, 664],
            [117, 645],
            [124, 628],
          ],
        },
      ],
      unless: [aboveHem(...TURNED_HEM)],
    },
    { name: 'shadow', take: [belowHem(...TURNED_HEM)] },
    { name: 'robe', take: [box(-1, 369, FAR, FAR * 2)] },
    { name: 'torso', take: [box(-1, -1, FAR, FAR * 2)] },
  ],
};

/** Each kept view's cut, by the view's name in his turnaround. */
export const CUTS = {
  front: FRONT,
  threeQuarterLeft: THREE_QUARTER_LEFT,
} as const satisfies Readonly<Record<string, PartCut>>;

/** What each view's label rules read: his colour classes and the view's part labels. */
export const CUT_OPTIONS = {
  front: { classes: CLASSES, labels: LABELS.front },
  threeQuarterLeft: { classes: CLASSES, labels: LABELS.threeQuarterLeft },
} as const satisfies Readonly<Record<keyof typeof CUTS, PartCutOptions>>;
