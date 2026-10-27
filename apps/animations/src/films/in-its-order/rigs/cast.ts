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

import { type CastProp, type CastView, castTable } from '@manna/film/rive';
import {
  HAND_ART,
  type TracedKnob,
  armReach,
  boilTime,
  tracedHands,
  type tracedFigure,
} from '@manna/film/style';
import * as LEAD_BACK from '../../../library/cast/lead-feast/rig/back-traced.ts';
import * as LEAD_DRINKING from '../../../library/cast/lead-feast/rig/drinking-traced.ts';
import * as LEAD_FRONT from '../../../library/cast/lead-feast/rig/front-traced.ts';
import * as LEAD from '../../../library/cast/lead-feast/rig/lead.ts';
import * as LEAD_PROFILE_LEFT from '../../../library/cast/lead-feast/rig/profile-left-traced.ts';
import * as LEAD_PROFILE_RIGHT from '../../../library/cast/lead-feast/rig/profile-right-traced.ts';
import * as LEAD_REACHING from '../../../library/cast/lead-feast/rig/reaching-traced.ts';
import * as LEAD_RAISED from '../../../library/cast/lead-feast/rig/raised-traced.ts';
import * as LEAD_SEATED from '../../../library/cast/lead-feast/rig/seated-traced.ts';
import * as LEAD_TQ_LEFT from '../../../library/cast/lead-feast/rig/three-quarter-left-traced.ts';
import * as LEAD_TQ_RIGHT from '../../../library/cast/lead-feast/rig/three-quarter-right-traced.ts';
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

/** A wince: his eyes squeezed shut as `>` `<`, his brows knit, his mouth a wavering line. */
const WINCE: Numbers = { wince: 1, eyes: 0, mouthLine: 0, browY: -5, browTilt: -0.5 };

/** Each member's kept views, by kind and view name, as the render draws them. */
export const CAST = castTable({
  'lead-feast': {
    turnaround: {
      front: turnaround(LEAD_FRONT, LEAD.leadFeastFront, RIGS.leadFeastFrontProp),
      threeQuarterLeft: turnaround(
        LEAD_TQ_LEFT,
        LEAD.leadFeastThreeQuarterLeft,
        RIGS.leadFeastThreeQuarterLeftProp,
      ),
      profileLeft: turnaround(
        LEAD_PROFILE_LEFT,
        LEAD.leadFeastProfileLeft,
        RIGS.leadFeastProfileLeftProp,
      ),
      back: turnaround(LEAD_BACK, LEAD.leadFeastBack, RIGS.leadFeastBackProp),
      profileRight: turnaround(
        LEAD_PROFILE_RIGHT,
        LEAD.leadFeastProfileRight,
        RIGS.leadFeastProfileRightProp,
      ),
      threeQuarterRight: turnaround(
        LEAD_TQ_RIGHT,
        LEAD.leadFeastThreeQuarterRight,
        RIGS.leadFeastThreeQuarterRightProp,
      ),
    },
    poses: {
      // Three-quarters left, his near arm raised with the bottle at his shoulder's height: his raised composition, its sleeve and his rolled head as the sheet draws them.
      'poses-1': pose(
        LEAD_RAISED.BOX,
        LEAD_RAISED.FEET,
        LEAD.leadFeastRaised,
        RIGS.leadFeastRaisedProp,
        {
          lean: 0,
          numbers: { mouth: 3 },
          reach: [],
          // The bottle in front of his fist, its foot at the sheet's (70, 418).
          props: [{ name: 'bottle', draw: bottle([-80, -299]), layer: 'front' }],
        },
      ),
      // In profile to the left, both hands up, his head tipped back, the plate at his mouth.
      'poses-2': pose(
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
      // Seated on the stool, three-quarters left, his near hand at his chin, his far hand on his lap.
      'poses-3': pose(
        LEAD_SEATED.BOX,
        LEAD_SEATED.FEET,
        LEAD.leadFeastSeated,
        RIGS.leadFeastSeatedProp,
        {
          lean: 0,
          numbers: {},
          // His near arm is the raised sleeve the sheet draws, its hand at his chin as traced (`leadFeastSeated`): it reaches nowhere.
          reach: [['far', LEAD_SEATED.HAND_FAR.at]],
          // The stool's seat runs in under his robe, as the sheet's does.
          props: [{ name: 'stool', draw: stool(43, 134, -97), layer: 'behind' }],
        },
      ),
      // Three-quarters left, leaning to the low table, his near hand on the bottle there: his reaching composition, its sleeve as the sheet draws it.
      'poses-4': pose(
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
      // His front at rest.
      'poses-5': pose(
        [1259, 225, 1493, 829],
        [1382, 829],
        LEAD.leadFeastFront,
        RIGS.leadFeastFrontProp,
        {
          lean: 0,
          numbers: {},
          reach: [
            ['near', [1294, 632]],
            ['far', [1460, 632]],
          ],
          props: [],
        },
      ),
    },
    heads: {
      // Three-quarters left: glad, a warm smile.
      'heads-1': bust(
        [26, 314, 267, 650],
        [105, 446.5],
        LEAD_TQ_LEFT,
        LEAD.leadFeastThreeQuarterLeft,
        RIGS.leadFeastThreeQuarterLeftProp,
        { mouth: 3.5 },
      ),
      // Three-quarters left: a wince.
      'heads-2': bust(
        [284, 314, 519, 649],
        [362, 453],
        LEAD_TQ_LEFT,
        LEAD.leadFeastThreeQuarterLeft,
        RIGS.leadFeastThreeQuarterLeftProp,
        WINCE,
      ),
      // Three-quarters left, his head tipped: worried, his brows' inner ends up, his mouth turned down.
      'heads-3': bust(
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
          mouth: -2.5,
        },
      ),
      // His front: plain, his mouth level.
      'heads-4': bust(
        [774, 314, 1014, 650],
        [894, 448.5],
        LEAD_FRONT,
        LEAD.leadFeastFront,
        RIGS.leadFeastFrontProp,
        { mouth: 0 },
      ),
      // His front: a wince.
      'heads-5': bust(
        [1025, 313, 1265, 650],
        [1144.5, 452],
        LEAD_FRONT,
        LEAD.leadFeastFront,
        RIGS.leadFeastFrontProp,
        WINCE,
      ),
      // His front: glad, his eyes shut in a smile and the glad mark's wide smile in place of his mouth's line, his head lifted (nod -7 lifts it 12 px off the bust's place: his smile 3 px under the sheet's, his chin's line 10 over it; lifted higher, the ink round his open chin rises out from behind his garment and crosses his neck).
      'heads-6': bust(
        [1276, 313, 1519, 650],
        [1399, 445.5],
        LEAD_FRONT,
        LEAD.leadFeastFront,
        RIGS.leadFeastFrontProp,
        {
          glad: 1,
          nod: -7,
          eyes: 0,
          mouthLine: 0,
        },
      ),
    },
  },
});
