import type { RivePropSpec } from '@manna/film/rive';
import {
  FIGURE_TIMELINES,
  type FigureTimeline,
  HAND_ART,
  HAND_TIMELINES,
  type HandTimeline,
} from '@manna/film/style';
import { Record as Rec } from 'effect';
import { ARTBOARDS, FIGURES } from './figures.ts';
import figuresRiv from './figures.riv' with { type: 'file' };
import {
  CHRIST_FACE_CHECK,
  CHRIST_FRONT_FACE_CHECK,
  CHRIST_FRONT_KNOBS,
  CHRIST_KNOBS,
  christ,
  christFront,
} from './christ-rig.ts';
import { FARMER_FACE_CHECK, FARMER_KNOBS, farmer } from './farmer-rig.ts';
import { HAND_OUT_STEPS } from './hand-rig.ts';
import { JUDGE_FACE_CHECK, JUDGE_KNOBS, judge } from './judge-rig.ts';
import { LEAD_FACE_CHECK, LEAD_KNOBS, lead } from './lead-rig.ts';
import { PROSECUTOR_FACE_CHECK, PROSECUTOR_KNOBS, prosecutor } from './prosecutor-rig.ts';

export const leadProp: RivePropSpec<FigureTimeline, keyof typeof LEAD_KNOBS> = {
  source: {
    riv: figuresRiv,
    artboard: ARTBOARDS.lead,
    timelines: FIGURE_TIMELINES,
    numbers: Rec.keys(LEAD_KNOBS),
  },
  engine: 'canvas',
  ...FIGURES.shot,
  key: 'righteousness-by-faith/lead',
  origin: lead.art.feet,
  face: LEAD_FACE_CHECK,
  concept: lead.concept,
};

export const judgeProp: RivePropSpec<FigureTimeline, keyof typeof JUDGE_KNOBS> = {
  source: {
    riv: figuresRiv,
    artboard: ARTBOARDS.judge,
    timelines: FIGURE_TIMELINES,
    numbers: Rec.keys(JUDGE_KNOBS),
  },
  engine: 'canvas',
  ...FIGURES.shot,
  key: 'righteousness-by-faith/judge',
  origin: judge.art.head,
  face: JUDGE_FACE_CHECK,
  concept: judge.concept,
};

export const prosecutorProp: RivePropSpec<FigureTimeline, keyof typeof PROSECUTOR_KNOBS> = {
  source: {
    riv: figuresRiv,
    artboard: ARTBOARDS.prosecutor,
    timelines: FIGURE_TIMELINES,
    numbers: Rec.keys(PROSECUTOR_KNOBS),
  },
  engine: 'canvas',
  ...FIGURES.shot,
  key: 'righteousness-by-faith/prosecutor',
  origin: prosecutor.art.feet,
  face: PROSECUTOR_FACE_CHECK,
  concept: prosecutor.concept,
};

export const christProp: RivePropSpec<FigureTimeline, keyof typeof CHRIST_KNOBS> = {
  source: {
    riv: figuresRiv,
    artboard: ARTBOARDS.christ,
    timelines: FIGURE_TIMELINES,
    numbers: Rec.keys(CHRIST_KNOBS),
  },
  engine: 'canvas',
  ...FIGURES.shot,
  key: 'righteousness-by-faith/christ',
  origin: christ.art.feet,
  face: CHRIST_FACE_CHECK,
  concept: christ.concept,
};

export const christFrontProp: RivePropSpec<FigureTimeline, keyof typeof CHRIST_FRONT_KNOBS> = {
  source: {
    riv: figuresRiv,
    artboard: ARTBOARDS.christFront,
    timelines: FIGURE_TIMELINES,
    numbers: Rec.keys(CHRIST_FRONT_KNOBS),
  },
  engine: 'canvas',
  ...FIGURES.shot,
  key: 'righteousness-by-faith/christ-front',
  origin: christFront.art.feet,
  face: CHRIST_FRONT_FACE_CHECK,
  concept: christFront.concept,
};

export const farmerProp: RivePropSpec<FigureTimeline, keyof typeof FARMER_KNOBS> = {
  source: {
    riv: figuresRiv,
    artboard: ARTBOARDS.farmer,
    timelines: FIGURE_TIMELINES,
    numbers: Rec.keys(FARMER_KNOBS),
  },
  engine: 'canvas',
  ...FIGURES.shot,
  key: 'righteousness-by-faith/farmer',
  origin: farmer.art.feet,
  face: FARMER_FACE_CHECK,
  concept: farmer.concept,
};

const handProp = (artboard: string, key: string, size = 1): RivePropSpec<HandTimeline, never> => ({
  source: { riv: figuresRiv, artboard, timelines: HAND_TIMELINES, numbers: [] },
  engine: 'canvas',
  ...FIGURES.shot,
  key: `righteousness-by-faith/${key}`,
  origin: [(HAND_ART.width * size) / 2, (HAND_ART.height * size) / 2],
});

export const leadHandProp = handProp(ARTBOARDS.leadHand, 'lead-hand');

export const skinHandProp = handProp(ARTBOARDS.skinHand, 'skin-hand');

export const christHandProp = handProp(ARTBOARDS.christHand, 'christ-hand');

export const christHandOutProps = [
  handProp(ARTBOARDS.christHandOut1, 'christ-hand-out-1', HAND_OUT_STEPS[0]),
  handProp(ARTBOARDS.christHandOut2, 'christ-hand-out-2', HAND_OUT_STEPS[1]),
  handProp(ARTBOARDS.christHandOut3, 'christ-hand-out-3', HAND_OUT_STEPS[2]),
  handProp(ARTBOARDS.christHandOut4, 'christ-hand-out-4', HAND_OUT_STEPS[3]),
] as const;

export const farmerHandProp = handProp(ARTBOARDS.farmerHand, 'farmer-hand');
