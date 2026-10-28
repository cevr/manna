// In Its Order's cast render (`film concept render in-its-order <member>`):
// each kept view of the sheets of the members `cold` casts, drawn by its rig
// in its pose (`CAST`), on the film's paper (`PAPER`), each sheet at its one
// scale (`SHEETS`, sheet pixels a canon unit, from the member's anchor view
// on that sheet). A standing view's rig stands with its feet where the sheet
// draws them on its ground line; a bust (a heads view) lies with its eyes'
// middle where the sheet draws it. A posed hand reaches to where the sheet
// lays it (`armReach`), and the host draws each circle hand at its cuff
// where the numbers put it (`tracedHands`); the props the sheet draws lie
// where it draws them (`../props.ts`). Each view's rig declares the kept
// view it is held to (`concept`: its sheet and box). `cast.test.ts` holds the
// table to the members' records: every kept view, no other, each in its kept
// box. Pure.

import { type CutoutView, cutoutTable } from '@manna/film/canvas';
import { type CastProp, type CastView, castTable } from '@manna/film/rive';
import {
  HAND_ART,
  type TracedKnob,
  armReach,
  boilTime,
  tracedHands,
  type tracedFigure,
} from '@manna/film/style';
import {
  BOXES as LEAD_BOXES,
  PUPPETS as LEAD_PUPPETS,
} from '../../../library/cast/lead-feast/cutout/puppets.ts';
import { SKELETONS as LEAD_SKELETONS } from '../../../library/cast/lead-feast/cutout/skeleton.ts';
import { RAISE as LEAD_RAISE } from '../../../library/cast/lead-feast/cutout/raise.ts';
import * as LEAD_BACK from '../../../library/cast/lead-feast/rig/back-traced.ts';
import * as LEAD_DRINKING from '../../../library/cast/lead-feast/rig/drinking-traced.ts';
import * as LEAD_FRONT from '../../../library/cast/lead-feast/rig/front-traced.ts';
import * as LEAD from '../../../library/cast/lead-feast/rig/lead.ts';
import { LABELS as LEAD_LABELS } from '../../../library/cast/lead-feast/rig/labels.ts';
import * as LEAD_PROFILE_LEFT from '../../../library/cast/lead-feast/rig/profile-left-traced.ts';
import * as LEAD_PROFILE_RIGHT from '../../../library/cast/lead-feast/rig/profile-right-traced.ts';
import * as LEAD_REACHING from '../../../library/cast/lead-feast/rig/reaching-traced.ts';
import * as LEAD_RAISED from '../../../library/cast/lead-feast/rig/raised-traced.ts';
import * as LEAD_SEATED from '../../../library/cast/lead-feast/rig/seated-traced.ts';
import * as LEAD_TQ_LEFT from '../../../library/cast/lead-feast/rig/three-quarter-left-traced.ts';
import * as LEAD_TQ_RIGHT from '../../../library/cast/lead-feast/rig/three-quarter-right-traced.ts';
import { CLASSES as LEAD_CLASSES } from '../../../library/cast/lead-feast/rig/trace.ts';
import {
  PAPERS as LEAD_PAPERS,
  TONES as LEAD_TONES,
} from '../../../library/cast/lead-feast/rig/papers.ts';
import { palette } from '../palette.ts';
import { bottle, plate, stool, table } from '../props.ts';
import * as RIGS from './rigs.ts';

type Pt = readonly [number, number];
type Box = readonly [number, number, number, number];
type Numbers = Readonly<Partial<Record<TracedKnob, number>>>;

/** A traced composition, as `tracedFigure` gives it. */
type Composed = ReturnType<typeof tracedFigure>;

/** The film's paper, as its page lays it (`film.ts`). */
export const PAPER = { base: palette.paper, tone: palette.paperTone, seed: 1844 } as const;

/** A paper's colours: its own, its shade and its light. */
const coloursOf = (
  ...ps: ReadonlyArray<{ readonly color: string; readonly shade?: string; readonly light?: string }>
) =>
  ps.flatMap((p) => [
    p.color,
    ...(p.shade === undefined ? [] : [p.shade]),
    ...(p.light === undefined ? [] : [p.light]),
  ]);

/**
 * Each member's colour classes for his fit rows (`film concept render`): a
 * class's samples on his kept sheets, and the papers and tones that paint it
 * on his rigs. His hair and its brown read as his line (darker than luma
 * 90), so it is no class.
 */
export const FIT_CLASSES = {
  'lead-feast': {
    cream: {
      sheet: LEAD_CLASSES.cream,
      paper: [
        ...coloursOf(
          LEAD_PAPERS.tunic,
          LEAD_PAPERS.sleeve,
          LEAD_PAPERS.sleeveAcross,
          LEAD_PAPERS.sleeveRaised,
        ),
        LEAD_TONES.sash,
        LEAD_TONES.raisedUnder,
        LEAD_TONES.creamAcrossInner,
        LEAD_TONES.creamAcrossFold,
      ],
    },
    teal: {
      sheet: LEAD_CLASSES.teal,
      paper: [
        ...coloursOf(LEAD_PAPERS.mantleSleeve),
        LEAD_TONES.mantle,
        LEAD_TONES.mantleShade,
        LEAD_TONES.tealEdge,
        LEAD_TONES.lapSleeveUnder,
      ],
    },
    skin: {
      sheet: LEAD_CLASSES.skin,
      paper: [
        ...coloursOf(LEAD_PAPERS.skin, LEAD_PAPERS.ear, LEAD_PAPERS.hand),
        LEAD_PAPERS.foot.color,
        LEAD_TONES.neck,
        LEAD_TONES.jawShade,
        LEAD_TONES.jawSoft,
        LEAD_TONES.earLit,
        LEAD_TONES.earShade,
      ],
    },
  },
} as const;

/** Every kept sheet is drawn 1536 by 1024. */
const SHEET = { width: 1536, height: 1024 } as const;

/** The series lead on his turnaround: his front, hair to soles 440 units (`lead.ts`). */
const LEAD_TURNAROUND = 1 / LEAD.SHEETS.turnaround.scale;

/**
 * Each member's sheets: their size and one scale, sheet pixels a canon unit,
 * each read off the sheet's anchor view. The lead's poses: poses-5, his
 * front at rest, hair (row 225) to soles (row 829) 440 units. His heads, busts
 * with no feet: 1.13 of his turnaround's, the mean of his eyes' spacing (52
 * px on heads-4 against 46.5 on the turnaround's front) and his head's width
 * across his ears at his eyes' row (185 px against 162).
 */
export const SHEETS = {
  'lead-feast': {
    turnaround: { ...SHEET, scale: LEAD_TURNAROUND },
    poses: { ...SHEET, scale: 1 / LEAD.SHEETS.poses.scale },
    heads: { ...SHEET, scale: LEAD_TURNAROUND * 1.13 },
  },
} as const;

/** A still pose: the breath at rest, the paper's boil at its first tick, the numbers given. */
const still = (numbers: Numbers) => ({
  timelines: [
    ['breath', 0],
    ['boil', boilTime(0)],
  ] as const,
  numbers,
});

/** `p` turned `by` radians about the origin. */
const turned = ([x, y]: Pt, by: number): Pt => [
  x * Math.cos(by) - y * Math.sin(by),
  x * Math.sin(by) + y * Math.cos(by),
];

/** A hand the sheet lays at a point, sheet pixels: which arm's, and where its elbow bends (`armReach`; at rest's side unless given). */
type Reach = readonly ['near' | 'far', Pt] | readonly ['near' | 'far', Pt, 'out'];

/** One kept view as the render draws it. */
interface ViewSpec {
  readonly member: 'lead-feast';
  readonly kind: keyof (typeof SHEETS)['lead-feast'];
  readonly box: Box;
  /** Where the rig's origin (his feet) stands, sheet pixels. */
  readonly at: Pt;
  readonly composed: Composed;
  readonly rig: CastView['rig'];
  readonly hand: CastView['rig'];
  /** His lean, radians, and the rest of his numbers (his face's, his head's). */
  readonly lean: number;
  readonly numbers: Numbers;
  /** The hands the sheet lays away from his sides: each arm reaches there. */
  readonly reach: ReadonlyArray<Reach>;
  readonly props: ReadonlyArray<CastProp>;
}

/**
 * A view: its rig in its kept box at `at`, held to that box of its sheet
 * (`concept`), each reaching arm's numbers those that take its hand to where
 * the sheet lays it (its lean undone first, since the host leans the hand
 * after), its two circle hands at its cuffs.
 */
const view = (v: ViewSpec): CastView => {
  const scale = SHEETS[v.member][v.kind].scale;
  const reached = Object.fromEntries(
    v.reach.flatMap(([side, p, elbow]) => {
      const units = turned([(p[0] - v.at[0]) / scale, (p[1] - v.at[1]) / scale], -v.lean);
      const r = armReach(v.composed.arms[side], units, elbow);
      return [
        [`${side}Arm`, r.turn],
        [`${side}Elbow`, r.bend],
      ];
    }),
  );
  const numbers: Numbers = { ...v.numbers, lean: v.lean, ...reached };
  const hands = tracedHands(v.composed.arms, numbers);
  const handPose = {
    timelines: [['boil', boilTime(0)]] as const,
    size: v.composed.hand / (2 * HAND_ART.r),
  };
  return {
    box: v.box,
    at: v.at,
    rig: { ...v.rig, concept: { image: { cast: v.member, sheet: v.kind }, box: v.box } },
    pose: still(numbers),
    with: [
      { rig: v.hand, pose: handPose, at: hands.far },
      { rig: v.hand, pose: handPose, at: hands.near },
    ],
    props: v.props,
  };
};

/** A traced view's place on its own sheet: its kept box and its feet. */
interface Placed {
  readonly BOX: Box;
  readonly FEET: Pt;
}

const LEAD_HAND = RIGS.leadFeastHandProp;

/** A turnaround view of the lead: his rig at rest, standing where the sheet draws him. */
const turnaround = (t: Placed, composed: Composed, rig: CastView['rig']): CastView =>
  view({
    member: 'lead-feast',
    kind: 'turnaround',
    box: t.BOX,
    at: t.FEET,
    composed,
    rig,
    hand: LEAD_HAND,
    lean: 0,
    numbers: {},
    reach: [],
    props: [],
  });

/** A pose of the lead on his poses sheet: his feet at `at` on its ground line. */
const pose = (
  box: Box,
  at: Pt,
  composed: Composed,
  rig: CastView['rig'],
  p: Pick<ViewSpec, 'lean' | 'numbers' | 'reach' | 'props'>,
): CastView =>
  view({ member: 'lead-feast', kind: 'poses', box, at, composed, rig, hand: LEAD_HAND, ...p });

/** A traced table's eyes' middle, sheet pixels. */
const eyesOf = (marks: { readonly eyes: readonly [Pt, Pt] }): Pt => [
  (marks.eyes[0][0] + marks.eyes[1][0]) / 2,
  (marks.eyes[0][1] + marks.eyes[1][1]) / 2,
];

/**
 * A bust of the lead on his heads sheet: his rig with its eyes' middle where
 * the sheet draws it (`eyes`, sheet pixels), his feet that far below at the
 * heads sheet's scale, his face's numbers `numbers`.
 */
const bust = (
  box: Box,
  eyes: Pt,
  t: Placed & { readonly MARKS: { readonly eyes: readonly [Pt, Pt] } },
  composed: Composed,
  rig: CastView['rig'],
  numbers: Numbers,
): CastView => {
  const ratio = SHEETS['lead-feast'].heads.scale / LEAD_TURNAROUND;
  const [ex, ey] = eyesOf(t.MARKS);
  return view({
    member: 'lead-feast',
    kind: 'heads',
    box,
    at: [eyes[0] + (t.FEET[0] - ex) * ratio, eyes[1] + (t.FEET[1] - ey) * ratio],
    composed,
    rig,
    hand: LEAD_HAND,
    lean: 0,
    numbers,
    reach: [],
    props: [],
  });
};

/**
 * A probe across a feature review-art-3 measured (`review-art-3-receipts/
 * probes-155.txt`), crop pixels, at the review's own line and darkness: his
 * chin's line down x 120 (luma under 135), his near ear's outer edge along
 * row 155 (under 90).
 */
const CHIN_PROBE = { name: 'chin', along: 'col', at: 120, from: 150, to: 260, dark: 135 } as const;
const EAR_PROBE = { name: 'earLeft', along: 'row', at: 155, from: 20, to: 80, dark: 90 } as const;

/**
 * Why a bust's rows are held to the busts' bars: review-art-3's b2, kept
 * ready on render 155. Each bust is his turnaround rig at the heads sheet's
 * scale (7 to 8% wide, his shoulders narrow, his sash at his neck, his cream
 * garment read teal), not a bust rig of its own: a follow-up.
 */
const BUST_WHY = "review-art-3 b2: the bust is his turnaround rig, not a bust rig (r155's values)";

/**
 * The busts' bars, each just past the widest the four busts review-art-3
 * kept ready read on render 155 (heads-1, 2, 4 and 5): his head band's edge
 * 8.17 (heads-2), its turn 22 (heads-2), his body's edge 10.18 (heads-1),
 * the overlap 0.81 (heads-5), thin paper 82 px (heads-5's chevrons), his
 * cream 0.01 (heads-5). A bust's own defect is its probe's: heads-3's frown,
 * heads-6's chin and ear.
 */
const BUST_BARS = {
  'silhouette.edge/head': { max: 9, why: BUST_WHY },
  'outline.turns/head': { max: 23, why: BUST_WHY },
  'silhouette.edge/body': { max: 11, why: BUST_WHY },
  'silhouette.iou': { min: 0.8, why: BUST_WHY },
  slivers: { max: 90, why: BUST_WHY },
  'class.iou/cream': { min: 0, why: BUST_WHY },
} as const;

/** Why the front's near ear is held to no part bar: the render lays its band to the ear's lobe alone, so the ear's skin runs on into his cheek under it and is his face's region (r155, keep-ready in review-art-3; the band's place is held by B1's `earLeft` probe on the busts). */
const NEAR_EAR_WHY =
  "the render's near ear runs on into his cheek under its band, so it is his face's region (r155; review-art-3 B1 kept the band)";

/** Why the three-quarter left's near hand is held looser: the house draws a hand as a whole circle (CRAFT, circle hands) where the sheet hides its far side behind his sleeve's shade. */
const CIRCLE_HAND_WHY =
  'a circle hand (CRAFT) over the hand the sheet half hides in shade (r155 0.5 and 5.78; review-art-3 kept the view)';

/** A view's own fit: its labels, its probes and its bars, each with why (`CastView.fit`). */
type ViewFit = NonNullable<CastView['fit']>;

/**
 * The lead's views' own fits, by kind and view: the busts' bars and probes,
 * each pose's bars where review-art-3 kept it ready with a difference he is
 * shown (its value on render 155 just inside), and the probes on what
 * review-art-3 measured wrong (poses-3's seat and chest fold, heads-3's
 * frown, heads-6's chin and ear).
 */
const LEAD_FIT = {
  // Each turnaround view's part rows, by the labels his tables are traced from (`labels.ts`). From behind, his head's label is his hair, which the fit rows read as his line (no fit class), so his head's, neck's, ears' and hands' rows fail as unresolved on both crops, and his back's critique waits, until his back has labels the fit classes read.
  turnaround: {
    front: {
      labels: LEAD_LABELS.front,
      bars: {
        'part.iou/earNear': { why: NEAR_EAR_WHY },
        'part.edge/earNear': { why: NEAR_EAR_WHY },
      },
    },
    threeQuarterLeft: {
      labels: LEAD_LABELS.threeQuarterLeft,
      bars: {
        'part.iou/handNear': { min: 0.45, why: CIRCLE_HAND_WHY },
        'part.edge/handNear': { max: 6, why: CIRCLE_HAND_WHY },
      },
    },
    profileLeft: { labels: LEAD_LABELS.profileLeft },
    back: { labels: LEAD_LABELS.back },
    profileRight: { labels: LEAD_LABELS.profileRight },
    threeQuarterRight: { labels: LEAD_LABELS.threeQuarterRight },
  },
  poses: {
    'poses-1': {
      bars: {
        'silhouette.edge/head': {
          max: 6,
          why: 'review-art-3 b8: the bottle laid over his hand (r155 5.32)',
        },
        'outline.turns/head': {
          max: 72,
          why: "review-art-3 b8: the bottle's top steps his head band's edge (r155 70)",
        },
      },
    },
    'poses-2': {
      bars: {
        'silhouette.edge/head': {
          max: 10,
          why: 'review-art-3 b8, m13: two whole hands side by side at the plate (r155 8.94)',
        },
        'outline.turns/head': {
          max: 103,
          why: "review-art-3 b8: the plate's rim and his hands step his head band's edge (r155 101)",
        },
        'class.iou/teal': { min: 0.5, why: 'review-art-3 b8: his far sleeve short (r155 0.51)' },
      },
    },
    'poses-3': {
      probes: [
        // a1: the stool's line under his torso, read across the seat; a2: the "A" bar on his chest (luma under 160, the review's #).
        { name: 'seat', along: 'row', at: 375, from: 180, to: 288 },
        { name: 'chestFold', along: 'row', at: 285, from: 98, to: 130, dark: 160 },
      ],
    },
    'poses-4': {
      bars: {
        'outline.turns/head': {
          max: 12,
          why: 'review-art-3 b9: kept ready; his rolled head over the reach (r155 11)',
        },
        'silhouette.edge/body': {
          max: 5.5,
          why: 'review-art-3 b9: the table and the bottle by his reaching hand (r155 5)',
        },
        'outline.turns/body': {
          max: 67,
          why: "review-art-3 b9: the table's top steps his body's edge (r155 65)",
        },
        'silhouette.iou': {
          min: 0.84,
          why: 'review-art-3 b9: the table and the bottle (r155 0.85)',
        },
      },
    },
    'poses-5': {
      bars: {
        'silhouette.edge/head': {
          max: 14,
          why: 'review-art-3 b3: poses-5 is his front at rest; the poses sheet draws his head larger (r155 12.91)',
        },
        'outline.turns/head': { max: 9, why: 'review-art-3 b3 (r155 8)' },
        'silhouette.edge/body': {
          max: 9,
          why: 'review-art-3 b3: his body 23% wider under the chin on the sheet (r155 8.48)',
        },
        'outline.turns/body': { max: 21, why: 'review-art-3 b3 (r155 20)' },
        'silhouette.iou': { min: 0.86, why: 'review-art-3 b3 (r155 0.87)' },
        'class.iou/teal': { min: 0.55, why: 'review-art-3 b3 (r155 0.59)' },
        'class.iou/skin': {
          min: 0.45,
          why: "review-art-3 b3: his head smaller than the sheet's (r155 0.48)",
        },
      },
    },
  },
  heads: {
    'heads-1': { bars: BUST_BARS, probes: [EAR_PROBE] },
    'heads-2': { bars: BUST_BARS, probes: [CHIN_PROBE, EAR_PROBE] },
    // a5: the frown, down x 72 above his chin (luma under 100).
    'heads-3': {
      bars: BUST_BARS,
      probes: [{ name: 'mouth', along: 'col', at: 72, from: 140, to: 200, dark: 100 }],
    },
    'heads-4': { bars: BUST_BARS, probes: [EAR_PROBE] },
    'heads-5': { bars: BUST_BARS, probes: [EAR_PROBE] },
    // a4: the nod that cut his ears and raised his chin's line.
    'heads-6': { bars: BUST_BARS, probes: [CHIN_PROBE, EAR_PROBE] },
  },
} satisfies Readonly<Record<string, Readonly<Record<string, ViewFit>>>>;

/** `view` with its own fit (`CastView.fit`). */
const fitted = (fit: ViewFit, view: CastView): CastView => ({ ...view, fit });

/** A wince: his eyes squeezed shut as `>` `<`, his brows knit, his mouth a wavering line. */
const WINCE: Numbers = { wince: 1, eyes: 0, mouthLine: 0, browY: -5, browTilt: -0.5 };

/** Each member's kept views, by kind and view name, as the render draws them. */
export const CAST = castTable({
  'lead-feast': {
    turnaround: {
      front: fitted(
        LEAD_FIT.turnaround.front,
        turnaround(LEAD_FRONT, LEAD.leadFeastFront, RIGS.leadFeastFrontProp),
      ),
      threeQuarterLeft: fitted(
        LEAD_FIT.turnaround.threeQuarterLeft,
        turnaround(
          LEAD_TQ_LEFT,
          LEAD.leadFeastThreeQuarterLeft,
          RIGS.leadFeastThreeQuarterLeftProp,
        ),
      ),
      profileLeft: fitted(
        LEAD_FIT.turnaround.profileLeft,
        turnaround(LEAD_PROFILE_LEFT, LEAD.leadFeastProfileLeft, RIGS.leadFeastProfileLeftProp),
      ),
      back: fitted(
        LEAD_FIT.turnaround.back,
        turnaround(LEAD_BACK, LEAD.leadFeastBack, RIGS.leadFeastBackProp),
      ),
      profileRight: fitted(
        LEAD_FIT.turnaround.profileRight,
        turnaround(LEAD_PROFILE_RIGHT, LEAD.leadFeastProfileRight, RIGS.leadFeastProfileRightProp),
      ),
      threeQuarterRight: fitted(
        LEAD_FIT.turnaround.threeQuarterRight,
        turnaround(
          LEAD_TQ_RIGHT,
          LEAD.leadFeastThreeQuarterRight,
          RIGS.leadFeastThreeQuarterRightProp,
        ),
      ),
    },
    poses: {
      // Three-quarters left, his near arm raised with the bottle at his shoulder's height: his raised composition, its sleeve and his rolled head as the sheet draws them.
      'poses-1': fitted(
        LEAD_FIT.poses['poses-1'],
        pose(LEAD_RAISED.BOX, LEAD_RAISED.FEET, LEAD.leadFeastRaised, RIGS.leadFeastRaisedProp, {
          lean: 0,
          numbers: { mouth: 3 },
          reach: [],
          // The bottle in front of his fist, its foot at the sheet's (70, 418).
          props: [{ name: 'bottle', draw: bottle([-80, -299]), layer: 'front' }],
        }),
      ),
      // In profile to the left, both hands up, his head tipped back, the plate at his mouth.
      'poses-2': fitted(
        LEAD_FIT.poses['poses-2'],
        pose(
          LEAD_DRINKING.BOX,
          LEAD_DRINKING.FEET,
          LEAD.leadFeastDrinking,
          RIGS.leadFeastDrinkingProp,
          {
            lean: 0,
            numbers: {},
            reach: [],
            // The plate's rim at his lips (the sheet's 397, 337), the dish out before his face; held: over his sleeves, under his hands.
            props: [{ name: 'plate', draw: plate([-55, -360], 0.55), layer: 'held' }],
          },
        ),
      ),
      // Seated on the stool, three-quarters left, his near hand at his chin, his far hand on his lap.
      'poses-3': fitted(
        LEAD_FIT.poses['poses-3'],
        pose(LEAD_SEATED.BOX, LEAD_SEATED.FEET, LEAD.leadFeastSeated, RIGS.leadFeastSeatedProp, {
          lean: 0,
          numbers: {},
          // His near arm is the raised sleeve the sheet draws, its hand at his chin as traced (`leadFeastSeated`): it reaches nowhere.
          reach: [['far', LEAD_SEATED.HAND_FAR.at]],
          // The stool behind him, its seat's top on the sheet's line (row 703) and running in under his mantle; its front leg beside his robe's side (x 803-825) and its far one at x 855-877, where the sheet draws them.
          props: [{ name: 'stool', draw: stool(69, 133, -97), layer: 'behind' }],
        }),
      ),
      // Three-quarters left, leaning to the low table, his near hand on the bottle there: his reaching composition, its sleeve as the sheet draws it.
      'poses-4': fitted(
        LEAD_FIT.poses['poses-4'],
        pose(
          LEAD_REACHING.BOX,
          LEAD_REACHING.FEET,
          LEAD.leadFeastReaching,
          RIGS.leadFeastReachingProp,
          {
            lean: 0,
            numbers: { mouth: 3 },
            reach: [],
            // The table's top at the sheet's row 617 from its left end to 1007, its leg at 952; the bottle on it, its middle at 953, in front of his hand.
            props: [
              { name: 'table', draw: table(-152, -73, -146, -113), layer: 'behind' },
              { name: 'bottle', draw: bottle([-112, -146]), layer: 'front' },
            ],
          },
        ),
      ),
      // His front at rest.
      'poses-5': fitted(
        LEAD_FIT.poses['poses-5'],
        pose([1259, 225, 1493, 829], [1382, 829], LEAD.leadFeastFront, RIGS.leadFeastFrontProp, {
          lean: 0,
          numbers: {},
          reach: [
            ['near', [1294, 632]],
            ['far', [1460, 632]],
          ],
          props: [],
        }),
      ),
    },
    heads: {
      // Three-quarters left: glad, a warm smile.
      'heads-1': fitted(
        LEAD_FIT.heads['heads-1'],
        bust(
          [26, 314, 267, 650],
          [105, 446.5],
          LEAD_TQ_LEFT,
          LEAD.leadFeastThreeQuarterLeft,
          RIGS.leadFeastThreeQuarterLeftProp,
          { mouth: 3.5 },
        ),
      ),
      // Three-quarters left: a wince.
      'heads-2': fitted(
        LEAD_FIT.heads['heads-2'],
        bust(
          [284, 314, 519, 649],
          [362, 453],
          LEAD_TQ_LEFT,
          LEAD.leadFeastThreeQuarterLeft,
          RIGS.leadFeastThreeQuarterLeftProp,
          WINCE,
        ),
      ),
      // Three-quarters left, his head tipped: worried, his brows' inner ends up, his mouth turned down.
      'heads-3': fitted(
        LEAD_FIT.heads['heads-3'],
        bust(
          [530, 314, 763, 650],
          // Where the sheet draws his eyes' middle less the 21 px his roll swings them right of his rig's (eyes 57-67 and 102-114 against the render's 80-89 and 122-133 at 615): his head inside its box.
          [594, 448],
          LEAD_TQ_LEFT,
          LEAD.leadFeastThreeQuarterLeft,
          RIGS.leadFeastThreeQuarterLeftProp,
          {
            // Rolled 13°, as the sheet's head is.
            tilt: 0.22,
            browTilt: 0.4,
            // His frown short and near flat, where the sheet draws it (rows 178-188 at x 65-80), under the line his rig's mouth lies on: 0.22 of his eyes' spacing wide.
            mouth: -0.5,
            mouthY: 12,
            mouthW: 0.76,
          },
        ),
      ),
      // His front: plain, his mouth level.
      'heads-4': fitted(
        LEAD_FIT.heads['heads-4'],
        bust(
          [774, 314, 1014, 650],
          [894, 448.5],
          LEAD_FRONT,
          LEAD.leadFeastFront,
          RIGS.leadFeastFrontProp,
          { mouth: 0 },
        ),
      ),
      // His front: a wince.
      'heads-5': fitted(
        LEAD_FIT.heads['heads-5'],
        bust(
          [1025, 313, 1265, 650],
          [1144.5, 452],
          LEAD_FRONT,
          LEAD.leadFeastFront,
          RIGS.leadFeastFrontProp,
          WINCE,
        ),
      ),
      // His front: glad, his eyes shut in a smile and the glad mark's wide smile in place of his mouth's line, his face turned up as the sheet draws it: his marks lifted inside a head that holds the bust's place (`marksY`), so his chin's line and his ears stay where the sheet draws them.
      'heads-6': fitted(
        LEAD_FIT.heads['heads-6'],
        bust(
          [1276, 313, 1519, 650],
          [1399, 445.5],
          LEAD_FRONT,
          LEAD.leadFeastFront,
          RIGS.leadFeastFrontProp,
          {
            glad: 1,
            marksY: -11,
            // His brows 3 px back down, under the fringe his rig's hair hangs lower than the sheet's.
            browY: 2,
            eyes: 0,
            mouthLine: 0,
          },
        ),
      ),
    },
  },
});

/** A cut-out view of the lead: his puppet of the view at rest, its origin at the kept box's corner, held to the view's own fit rows. */
const cutout = (fit: ViewFit, view: keyof typeof LEAD_PUPPETS): CutoutView => {
  const box = LEAD_BOXES[view];
  return {
    box,
    at: [box[0], box[1]],
    puppet: LEAD_PUPPETS[view],
    pose: { numbers: {}, root: LEAD_SKELETONS[view].root, scale: 1 },
    fit,
  };
};

/**
 * The views a member has a puppet for (`film concept render --figure
 * cutout`): each his part sheet's puppet at rest, standing where the kept
 * view stands, held to the same fit rows as his rig's view. `CAST` is the
 * rigs' table, unchanged beside it.
 */
export const CUTOUT = cutoutTable({
  'lead-feast': {
    turnaround: {
      front: cutout(LEAD_FIT.turnaround.front, 'front'),
      threeQuarterLeft: cutout(LEAD_FIT.turnaround.threeQuarterLeft, 'threeQuarterLeft'),
    },
    heads: {
      'heads-4': cutout(LEAD_FIT.heads['heads-4'], 'heads-4'),
    },
  },
});

/** Each member's eases (`film concept ease`): the lead's bottle raise, drawn from keys. */
export const EASES = {
  'lead-feast': { raise: LEAD_RAISE },
};
