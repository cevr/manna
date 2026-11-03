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

type Composed = ReturnType<typeof tracedFigure>;

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

const handProp = (artboard: string, key: string): RivePropSpec<HandTimeline, never> => ({
  source: { riv: figuresRiv, artboard, timelines: HAND_TIMELINES, numbers: [] },
  engine: 'canvas',
  ...FIGURES.shot,
  key: `in-its-order/${key}`,
  origin: [HAND_ART.width / 2, HAND_ART.height / 2],
});

export const leadFeastFrontProp = figureProp(
  ARTBOARDS.leadFeastFront,
  'lead-feast-front',
  LEAD.leadFeastFront,
);

export const leadFeastThreeQuarterLeftProp = figureProp(
  ARTBOARDS.leadFeastThreeQuarterLeft,
  'lead-feast-three-quarter-left',
  LEAD.leadFeastThreeQuarterLeft,
);

export const leadFeastProfileLeftProp = figureProp(
  ARTBOARDS.leadFeastProfileLeft,
  'lead-feast-profile-left',
  LEAD.leadFeastProfileLeft,
);

export const leadFeastBackProp = figureProp(
  ARTBOARDS.leadFeastBack,
  'lead-feast-back',
  LEAD.leadFeastBack,
);

export const leadFeastProfileRightProp = figureProp(
  ARTBOARDS.leadFeastProfileRight,
  'lead-feast-profile-right',
  LEAD.leadFeastProfileRight,
);

export const leadFeastThreeQuarterRightProp = figureProp(
  ARTBOARDS.leadFeastThreeQuarterRight,
  'lead-feast-three-quarter-right',
  LEAD.leadFeastThreeQuarterRight,
);

export const leadFeastHandProp = handProp(ARTBOARDS.leadFeastHand, 'lead-feast-hand');

export const leadFeastRaisedProp = figureProp(
  ARTBOARDS.leadFeastRaised,
  'lead-feast-raised',
  LEAD.leadFeastRaised,
);

export const leadFeastDrinkingProp = figureProp(
  ARTBOARDS.leadFeastDrinking,
  'lead-feast-drinking',
  LEAD.leadFeastDrinking,
);

export const leadFeastReachingProp = figureProp(
  ARTBOARDS.leadFeastReaching,
  'lead-feast-reaching',
  LEAD.leadFeastReaching,
);

export const leadFeastSeatedProp = figureProp(
  ARTBOARDS.leadFeastSeated,
  'lead-feast-seated',
  LEAD.leadFeastSeated,
);
