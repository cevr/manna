import { ground } from '@manna/film/canvas';
import { lerp } from '@manna/film/core';
import type { PoseOf } from '@manna/film/rive';
import { ACCUSED, JUDGE } from '../../../righteousness-by-faith/court.ts';
import type { CourtFrame } from '../../scenes/court.ts';
import { EASE, type Expression, acted, smooth } from '@manna/film/style';
import { ACCUSED_KNOBS, ACCUSED_TIMELINES, type AccusedTimeline, boilTime } from './figures.ts';
import type { accusedProp } from './rigs.ts';

type Cue = 'bow' | 'stamp' | 'lift';

const cueTime = (f: CourtFrame, cue: Cue, timeline: AccusedTimeline): number => {
  const { start, dur } = f.cue(cue);
  const since = f.t - start;
  if (since <= 0) return 0;
  const { seconds, move } = ACCUSED_TIMELINES[timeline];
  if (since < dur) return (since / dur) * move;
  return Math.min(seconds, move + since - dur);
};

const settled = (f: CourtFrame) => {
  const { seconds, move } = ACCUSED_TIMELINES.lift;
  return Math.max(0, cueTime(f, 'lift', 'lift') - move) / (seconds - move);
};

const WORRY: Expression = { ...EASE, browTilt: 0.26, browY: -1, mouth: -0.8 };
const SHAME: Expression = { ...EASE, browY: 2.5, browTilt: 0.2, eyes: 0.55, mouth: -1.8 };
const FEAR: Expression = {
  ...EASE,
  browY: -2.5,
  browTilt: 0.36,
  eyes: 1.2,
  eyeW: 0.92,
  mouth: -1.4,
};
const ASTONISHED: Expression = {
  ...EASE,
  browY: -2.5,
  browTilt: 0.04,
  eyes: 1.55,
  eyeW: 1.3,
  mouthLine: 0,
  mouthOpen: 1,
};
const RELIEF: Expression = { ...EASE, browY: -1.5, browTilt: 0.2, eyes: 1.08, mouth: 2.6 };

const GAZE = {
  rest: [ACCUSED_KNOBS.gazeX, ACCUSED_KNOBS.gazeY],
  evidence: [150, -60],
  down: [-60, 200],
  judge: [JUDGE[0] - ACCUSED[0], JUDGE[1] - ACCUSED[1]],
} as const;

const NUMBERS: Record<keyof typeof ACCUSED_KNOBS, number> = { ...ACCUSED_KNOBS };

const poseOf = (f: CourtFrame): PoseOf<ReturnType<typeof accusedProp>> => {
  const drop = f.at('drop');
  const bow = f.at('bow');
  const lean = f.at('lean');
  const lift = f.at('lift');
  acted(NUMBERS, EASE, [
    [WORRY, drop],
    [SHAME, bow],
    [FEAR, lean],
    [ASTONISHED, f.at('stamp')],
    [RELIEF, smooth(0.1, 0.8, settled(f))],
  ]);
  const look = (axis: 0 | 1) => {
    const evidence = lerp(GAZE.rest[axis], GAZE.evidence[axis], drop);
    const down = lerp(evidence, GAZE.down[axis], bow);
    const dare = lerp(down, GAZE.judge[axis], 0.45 * lean);
    return lerp(dare, GAZE.judge[axis], lift);
  };
  NUMBERS.gazeX = look(0);
  NUMBERS.gazeY = look(1);
  NUMBERS.follow = 0.06 * lean * (1 - lift) + 0.08 * lift;
  return {
    timelines: [
      ['breath', f.t % ACCUSED_TIMELINES.breath.seconds],
      ['bow', cueTime(f, 'bow', 'bow')],
      ['stamp', cueTime(f, 'stamp', 'stamp')],
      ['lift', cueTime(f, 'lift', 'lift'), f.t > f.cue('lift').start ? 1 : 0],
      ['boil', boilTime(f.boil)],
    ] as const,
    numbers: NUMBERS,
  };
};

export const riveAccused = (f: CourtFrame) => {
  ground(f.ctx, 0, 2, 100);
  f.rive('accused', poseOf(f));
};
