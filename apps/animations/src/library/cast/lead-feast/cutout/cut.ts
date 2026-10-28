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
// paper between his sandals is the view's ground, owned by no part. A hand
// takes its whole ink ring, so no piece of it stays behind when the arm moves.
// His bust (heads-4) is two parts, his head over the rest; its figure is read
// with the foot of the view closed (`cutOptionsFor`). Each view names the
// parts a pose moves, and the words okra repaints what they hide by
// (`HIDDEN`, read by `film concept parts`, which writes `sheets/<view>/`).
// Pure.

import {
  cutParts,
  type HiddenEntry,
  type PartCut,
  type PartCutOptions,
  type PartRule,
} from '@manna/film/tools';
import { Result } from 'effect';
import { LABELS } from '../rig/labels.ts';
import { CLASSES } from '../rig/trace.ts';
import { JOINTS } from './joints.ts';

export { JOINTS };

type Pt = readonly [number, number];

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
      take: [
        ...turnedRight.take,
        { label: 'handNear' },
        // his near hand's ink ring, taller than wide, read off an 8x crop: out to its outer edge, short of his robe's teal beside it
        {
          polygon: [
            [-1, 410],
            [8, 403],
            [20, 401],
            [32, 403],
            [38, 408],
            [41, 416],
            [41, 442],
            [38, 450],
            [32, 455],
            [22, 458],
            [12, 456],
            [4, 450],
            [-1, 444],
          ],
        },
      ],
      unless: turnedRight.unless,
      pivot: JOINTS.threeQuarterLeft.shoulderRight,
    },
    {
      name: 'armLeft',
      // his far hand's ink ring, read off 7x and 9x crops, out to its outer edge; the cuff's end each side of it, and the ring's far edge
      take: [
        ...turnedLeft.take,
        { label: 'handFar' },
        { disc: { c: [184, 430], r: 27 } },
        box(151, 405, FAR, 419),
        box(190, 405, FAR, 452),
      ],
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

/**
 * His bust facing the viewer (heads-4), read off 4x and 8x crops: his head
 * (hair, face and ears) above the row where his jaw's ink meets his neck's
 * outline, with the dark shadow his chin casts on his neck between those
 * outlines, so the shadow turns with his chin; his neck below it, his
 * collar and garments.
 */
const HEADS_4: PartCut = {
  parts: [
    {
      name: 'head',
      take: [
        {
          polygon: [
            [-1, -1],
            [FAR, -1],
            [FAR, 214],
            [155, 214],
            [155, 233],
            [90, 233],
            [90, 214],
            [-1, 214],
          ],
        },
      ],
      pivot: [120, 232],
    },
    { name: 'torso', take: [box(-1, -1, FAR, FAR * 2)] },
  ],
};

/** Each kept view's cut, by the view's name in his sheets' views. */
export const CUTS = {
  front: FRONT,
  threeQuarterLeft: THREE_QUARTER_LEFT,
  'heads-4': HEADS_4,
} as const satisfies Readonly<Record<string, PartCut>>;

/** A view of his, by its name in his sheets' views. */
type CutView = keyof typeof CUTS;

/** What each turnaround view's label rules read: his colour classes and the view's part labels. */
export const CUT_OPTIONS = {
  front: { classes: CLASSES, labels: LABELS.front },
  threeQuarterLeft: { classes: CLASSES, labels: LABELS.threeQuarterLeft },
} as const satisfies Readonly<Record<string, PartCutOptions>>;

type View = Parameters<typeof cutParts>[0];

/** His sheets' ink, for the row that closes a bust's foot. */
const INK = [42, 30, 24, 255] as const;

/**
 * A bust's figure: his heads views run off their foot, where his cream
 * tunic meets the view's edge and reads as ground to a flood from the
 * border. Read with a row of ink under the view, the foot is closed, and
 * the figure is the cut's own reading (enclosed paper less) of what the
 * border does not reach.
 */
const bustFigure = (view: View): Uint8Array => {
  const n = view.width * view.height;
  const rgba = new Uint8Array((n + view.width) * 4);
  rgba.set(view.rgba);
  for (let x = 0; x < view.width; x++) rgba.set(INK, (n + x) * 4);
  const closed = { width: view.width, height: view.height + 1, rgba };
  const all: PartCut = { parts: [{ name: 'figure', take: [box(-1, -1, FAR * 2, FAR * 2)] }] };
  return Result.match(cutParts(closed, all), {
    onSuccess: (sheet) => sheet.owner.slice(0, n),
    onFailure: () => new Uint8Array(n),
  });
};

/** What a view's cut reads beside the view: a turnaround view's labels, a bust's figure with its foot closed. */
export const cutOptionsFor = (name: CutView, view: View): PartCutOptions => OPTIONS_FOR[name](view);

const OPTIONS_FOR: Readonly<Record<CutView, (view: View) => PartCutOptions>> = {
  front: () => CUT_OPTIONS.front,
  threeQuarterLeft: () => CUT_OPTIONS.threeQuarterLeft,
  'heads-4': (view) => ({ figure: bustFigure(view) }),
};

/** The okra repaint's opening: the picture and what was cut away. */
const CUT_AWAY =
  'Edit this picture. It is a cut-paper character on cream paper; the flat magenta areas are where';

/** Where his body's sides run under his arms: out to his shoulders and robe, not in at the sleeves' inner edges. */
const SIDES =
  'Each side of his body runs straight down from the outer end of his shoulder to the outer edge of his robe below, so his body under the arms is as wide as his shoulders and his robe, and the tunic and mantle fill everything inside that line with the same soft shade and fine paper grain the sheet paints beside each arm.';

/** The shade his arms cast on his body stays, and runs on under them. */
const SHADE =
  'Keep the soft shade each arm casts on his body beside it exactly as it is, and carry that same shade on under where the arm was.';

/** The paper grain his sheet shows on his sash and torso, carried into the paint under his arms. */
const GRAIN =
  'Paint the white sash and the tunic and mantle of his body with the same fine paper grain the sheet shows on them beside the arms: a fine, even speckle through every flat area of colour, never smooth flat colour.';

/** The repaint's close: nothing else moves. */
const KEEP_REST =
  'Keep every other pixel exactly as it is: the same size, position and framing, and every part that is not magenta unchanged.';

/**
 * Each view's moving parts (what a pose moves, whose areas are painted
 * magenta and repainted beneath), and the words okra repaints them by: what
 * lies under them, in the sheet's own style; and any calls granted beyond
 * the three a view takes, with who granted them, when and why.
 */
export const HIDDEN = {
  front: {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms (sleeves and round hands) were cut away to make a cut-out puppet. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body, from each armpit down to the robe, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading (cream tunic on the viewer's left side, the teal-blue mantle on the viewer's right side, the white sash running round to each side of his waist). ${SIDES} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same head, face, hair, robe, sash, feet, size, position and framing.`,
  },
  threeQuarterLeft: {
    moving: ['armRight', 'armLeft'],
    prompt: `${CUT_AWAY} his two arms (sleeves and round hands) were cut away to make a cut-out puppet. He is turned three-quarters to the viewer's left. Repaint ONLY the magenta areas, as what lies underneath his arms: the sides of his body, from each armpit down to the robe, each side closed by the same thick dark brown-black outline as the rest of him, painted in exactly the same style, colours and soft shading (the cream tunic on the viewer's left side, the teal-blue mantle on the viewer's right side, the white sash running round his waist). ${SIDES} ${SHADE} ${GRAIN} There are no arms now: no sleeves, no hands, nothing magenta left. Where the magenta lay outside his body, it becomes the plain cream paper. Keep every other pixel exactly as it is: the same head, face, hair, robe, sash, feet, size, position and framing.`,
    allowance: {
      calls: 3,
      by: 'coordinator',
      on: '2026-10-27',
      why: 'its three calls were drawn on a hand cut that gave the arms body pixels; the cut was fixed after them (hands as rings), and the fixed cut had never been asked',
    },
    named: [
      {
        bar: 'grain',
        part: 'sash',
        by: 'coordinator',
        on: '2026-10-27',
        why: "okra paints the sash under his arms flatter than the sheet's paper grain on it, under both the box and the point lay and after a call that asked for the grain; every other bar holds",
      },
    ],
  },
  'heads-4': {
    moving: ['head'],
    prompt: `${CUT_AWAY} his head (his hair, face and ears) was cut away to make a cut-out puppet. Repaint ONLY the magenta area, as what lies behind his head: his neck rising straight up from his collar as a plain column of skin to about where his mouth was, its two sides closed by the same thick dark brown-black outline as the rest of him, its top simply rounded and closed by the same outline (no opening, no rim, no dark band), in exactly the same skin colour, soft shading and fine paper grain as his neck below. Everywhere else in the magenta area becomes the plain cream paper. There is no head now: no hair, no face, no ears, nothing magenta left. ${KEEP_REST}`,
  },
} as const satisfies Readonly<Record<CutView, HiddenEntry>>;
