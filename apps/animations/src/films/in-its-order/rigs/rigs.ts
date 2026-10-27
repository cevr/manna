// In Its Order's figure rigs as a drawing declares them (`drawing({ rigs })`
// and the cast render's table, `cast.ts`): each artboard of `figures.riv`
// (`figures.ts`) with the timelines a pose may name, the view model's numbers
// it may set, where on it our origin stands (a standing figure's feet, a
// hand's centre), how it follows the shot (`FIGURES.shot`: its line thins in
// a close shot), and the kept view of its member's sheet it is traced from
// (`concept`, which `film match` and the cast render hold it to). Canvas 2D
// is the engine, and every scene draws them the same way. Pure.

import type { RivePropSpec } from '@manna/film/rive';
import {
  FIGURE_TIMELINES,
  type FigureTimeline,
  HAND_ART,
  HAND_TIMELINES,
  type HandTimeline,
  type TracedKnob,
  type tracedFigure,
} from '@manna/film/style';
import * as LEAD from '../../../library/cast/lead-feast/rig/lead.ts';
import { ARTBOARDS, FIGURES } from './figures.ts';
import figuresRiv from './figures.riv' with { type: 'file' };

/** A traced composition, as `tracedFigure` gives it. */
type Composed = ReturnType<typeof tracedFigure>;

/** A traced figure's rig: its feet at our origin, its face for `check`, its concept its kept view. */
const figureProp = (
  artboard: string,
  key: string,
  composed: Composed,
): RivePropSpec<FigureTimeline, TracedKnob> => ({
  source: {
    riv: figuresRiv,
    artboard,
    timelines: FIGURE_TIMELINES,
    numbers: composed.numbers,
  },
  engine: 'canvas',
  ...FIGURES.shot,
  key: `in-its-order/${key}`,
  origin: composed.figure.art.feet,
  face: composed.face,
  concept: composed.figure.concept,
});

/**
 * A circle hand of `artboard`, its centre at our origin: its paper crawls by
 * its `boil` timeline, and its view model's one number, `ink`, is the shot's.
 */
const handProp = (artboard: string, key: string): RivePropSpec<HandTimeline, never> => ({
  source: { riv: figuresRiv, artboard, timelines: HAND_TIMELINES, numbers: [] },
  engine: 'canvas',
  ...FIGURES.shot,
  key: `in-its-order/${key}`,
  origin: [HAND_ART.width / 2, HAND_ART.height / 2],
});

/** The series lead from the front, his feet at our origin. */
export const leadFeastFrontProp = figureProp(
  ARTBOARDS.leadFeastFront,
  'lead-feast-front',
  LEAD.leadFeastFront,
);

/** The series lead three-quarters to screen left. */
export const leadFeastThreeQuarterLeftProp = figureProp(
  ARTBOARDS.leadFeastThreeQuarterLeft,
  'lead-feast-three-quarter-left',
  LEAD.leadFeastThreeQuarterLeft,
);

/** The series lead in profile to screen left. */
export const leadFeastProfileLeftProp = figureProp(
  ARTBOARDS.leadFeastProfileLeft,
  'lead-feast-profile-left',
  LEAD.leadFeastProfileLeft,
);

/** The series lead from behind. */
export const leadFeastBackProp = figureProp(
  ARTBOARDS.leadFeastBack,
  'lead-feast-back',
  LEAD.leadFeastBack,
);

/** The series lead in profile to screen right. */
export const leadFeastProfileRightProp = figureProp(
  ARTBOARDS.leadFeastProfileRight,
  'lead-feast-profile-right',
  LEAD.leadFeastProfileRight,
);

/** The series lead three-quarters to screen right. */
export const leadFeastThreeQuarterRightProp = figureProp(
  ARTBOARDS.leadFeastThreeQuarterRight,
  'lead-feast-three-quarter-right',
  LEAD.leadFeastThreeQuarterRight,
);

/** The series lead's hand, in his skin. */
export const leadFeastHandProp = handProp(ARTBOARDS.leadFeastHand, 'lead-feast-hand');

/** The series lead seated on a low stool. */
export const leadFeastSeatedProp = figureProp(
  ARTBOARDS.leadFeastSeated,
  'lead-feast-seated',
  LEAD.leadFeastSeated,
);
