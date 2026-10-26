// In Its Order's cast render (`film concept render in-its-order <member>`):
// each kept view of the sheets of the members `cold` casts, drawn by its rig
// in its pose (`CAST`), on the film's paper (`PAPER`), each sheet at its one
// scale (`SHEETS`, sheet pixels a canon unit, from the member's anchor view).
// A standing view's rig stands with its traced feet on the sheet's ground
// line; its hands are drawn at its cuffs where its numbers put them
// (`tracedHands`). `cast.test.ts` holds the table to the members' records:
// every kept view, no other, each in its kept box. Pure.

import { type CastView, castTable } from '@manna/film/rive';
import {
  HAND_ART,
  type TracedKnob,
  boilTime,
  tracedHands,
  type tracedFigure,
} from '@manna/film/style';
import * as LEAD_BACK from '../../../library/cast/lead-feast/rig/back-traced.ts';
import * as LEAD_FRONT from '../../../library/cast/lead-feast/rig/front-traced.ts';
import * as LEAD from '../../../library/cast/lead-feast/rig/lead.ts';
import * as LEAD_PROFILE_LEFT from '../../../library/cast/lead-feast/rig/profile-left-traced.ts';
import * as LEAD_PROFILE_RIGHT from '../../../library/cast/lead-feast/rig/profile-right-traced.ts';
import * as LEAD_TQ_LEFT from '../../../library/cast/lead-feast/rig/three-quarter-left-traced.ts';
import * as LEAD_TQ_RIGHT from '../../../library/cast/lead-feast/rig/three-quarter-right-traced.ts';
import { palette } from '../palette.ts';
import * as RIGS from './rigs.ts';

type Pt = readonly [number, number];

/** A traced composition, as `tracedFigure` gives it. */
type Composed = ReturnType<typeof tracedFigure>;

/** A traced view's place on its sheet: its kept box and its feet. */
interface Placed {
  readonly BOX: readonly [number, number, number, number];
  readonly FEET: Pt;
}

/** The film's paper, as its page lays it (`film.ts`). */
export const PAPER = { base: palette.paper, tone: palette.paperTone, seed: 1844 } as const;

/** Every kept sheet is drawn 1536 by 1024. */
const SHEET = { width: 1536, height: 1024 } as const;

/** Each member's sheets: their size and one scale, sheet pixels a canon unit. */
export const SHEETS = {
  'lead-feast': {
    turnaround: { ...SHEET, scale: 1 / LEAD.SHEETS.turnaround.scale },
  },
} as const;

/** A still pose: the breath at rest, the paper's boil at its first tick, the numbers given. */
const still = (numbers: Readonly<Partial<Record<TracedKnob, number>>> = {}) => ({
  timelines: [
    ['breath', 0],
    ['boil', boilTime(0)],
  ] as const,
  numbers,
});

/**
 * A standing view: `composed`'s rig `rig` in the kept box its table `t`
 * names, its feet at the traced feet, its numbers `numbers`, its two circle
 * hands (`hand`) at its cuffs.
 */
const standing = (
  t: Placed,
  composed: Composed,
  rig: CastView['rig'],
  hand: CastView['rig'],
  numbers: Readonly<Partial<Record<TracedKnob, number>>> = {},
): CastView => {
  const at = tracedHands(composed.arms, numbers);
  const size = composed.hand / (2 * HAND_ART.r);
  const handPose = { timelines: [['boil', boilTime(0)]] as const, size };
  return {
    box: t.BOX,
    at: t.FEET,
    rig,
    pose: still(numbers),
    with: [
      { rig: hand, pose: handPose, at: at.far },
      { rig: hand, pose: handPose, at: at.near },
    ],
  };
};

const hand = RIGS.leadFeastHandProp;

/** Each member's kept views, by kind and view name, as the render draws them. */
export const CAST = castTable({
  'lead-feast': {
    turnaround: {
      front: standing(LEAD_FRONT, LEAD.leadFeastFront, RIGS.leadFeastFrontProp, hand),
      threeQuarterLeft: standing(
        LEAD_TQ_LEFT,
        LEAD.leadFeastThreeQuarterLeft,
        RIGS.leadFeastThreeQuarterLeftProp,
        hand,
      ),
      profileLeft: standing(
        LEAD_PROFILE_LEFT,
        LEAD.leadFeastProfileLeft,
        RIGS.leadFeastProfileLeftProp,
        hand,
      ),
      back: standing(LEAD_BACK, LEAD.leadFeastBack, RIGS.leadFeastBackProp, hand),
      profileRight: standing(
        LEAD_PROFILE_RIGHT,
        LEAD.leadFeastProfileRight,
        RIGS.leadFeastProfileRightProp,
        hand,
      ),
      threeQuarterRight: standing(
        LEAD_TQ_RIGHT,
        LEAD.leadFeastThreeQuarterRight,
        RIGS.leadFeastThreeQuarterRightProp,
        hand,
      ),
    },
  },
});
