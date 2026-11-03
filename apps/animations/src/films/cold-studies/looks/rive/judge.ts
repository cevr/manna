import { at, rectShape, rounded } from '@manna/film/canvas';
import { lerp } from '@manna/film/core';
import type { PoseOf } from '@manna/film/rive';
import { ACCUSED, JUDGE } from '../../../righteousness-by-faith/court.ts';
import { C, piece } from '../../../righteousness-by-faith/kit.ts';
import { ramps } from '../../palette.ts';
import type { CourtFrame } from '../../scenes/court.ts';
import type { Bench, Props } from '../cutpaper/court.ts';
import { EASE, type Expression, type Pt, acted, reachAbout } from '@manna/film/style';
import { ACCUSED_HEAD, JUDGE_KNOBS, JUDGE_TIMELINES, boilTime } from './figures.ts';
import type { judgeProp } from './rigs.ts';

const READING: Expression = { ...EASE, eyes: JUDGE_KNOBS.eyes, browY: 1, browTilt: 0.02 };
const REGARD: Expression = { ...EASE, eyes: 1.05, browY: 0.5, browTilt: -0.08 };
const KIND: Expression = { ...EASE, eyes: 1, browY: -2.2, browTilt: 0.28, mouth: 1.6 };

const GAZE = {
  papers: [JUDGE_KNOBS.gazeX, JUDGE_KNOBS.gazeY],
  accused: [ACCUSED[0] - JUDGE[0], ACCUSED[1] + ACCUSED_HEAD - JUDGE[1]],
} as const;

const LEAN = -0.06;

const NUMBERS: Record<keyof typeof JUDGE_KNOBS, number> = { ...JUDGE_KNOBS };

const poseOf = (f: CourtFrame, lean: number): PoseOf<ReturnType<typeof judgeProp>> => {
  acted(NUMBERS, READING, [
    [REGARD, lean],
    [KIND, f.at('stamp')],
  ]);
  NUMBERS.gazeX = lerp(GAZE.papers[0], GAZE.accused[0], lean);
  NUMBERS.gazeY = lerp(GAZE.papers[1], GAZE.accused[1], lean);
  NUMBERS.follow = 0;
  NUMBERS.lean = LEAN * lean;
  return {
    timelines: [
      ['breath', f.t % JUDGE_TIMELINES.breath.seconds],
      ['boil', boilTime(f.boil)],
    ] as const,
    numbers: NUMBERS,
  };
};

const SHOULDER: Pt = [74, 70];
const REST: Pt = [92, 104];
const GAVEL: Pt = [1330, 445];
const GRIP = 16;

const GAVEL_HANDLE = rounded(0, -52, 12, 100, 4);
const GAVEL_HEAD = rounded(0, -104, 64, 34, 8);

const READING_SHEET = { x: 1186, y: 461, rot: -0.03, shape: rectShape(-48, -4, 96, 8) } as const;

const handAt = (swing: number, lean: number): Pt => {
  const shoulder: Pt = [JUDGE[0] + SHOULDER[0], JUDGE[1] + SHOULDER[1] + 10 * lean];
  const rest: Pt = [JUDGE[0] + REST[0], JUDGE[1] + REST[1]];
  const grip: Pt = [GAVEL[0] + Math.sin(swing) * GRIP, GAVEL[1] - Math.cos(swing) * GRIP];
  return reachAbout(shoulder, rest, grip, lean);
};

const benchTop = (f: CourtFrame, swing: number, props: Props) => {
  const { ctx } = f;
  at(ctx, READING_SHEET, () =>
    piece(ctx, READING_SHEET.shape, ramps.paper.base, f.hand('judgeSheet'), {
      role: 'scenery',
      kind: 'cut',
      line: 2,
      outline: props.sheetInk,
    }),
  );
  at(ctx, { x: GAVEL[0], y: GAVEL[1], rot: swing }, () => {
    piece(ctx, GAVEL_HANDLE, C.inkSoft, f.hand('handle'), {
      role: 'figure',
      line: 2,
      outline: props.gavelInk,
    });
    piece(ctx, GAVEL_HEAD, C.cutDeep, f.hand('gavelHead'), {
      role: 'figure',
      line: 2.5,
      outline: props.gavelInk,
    });
  });
};

export const riveJudge: Bench = {
  behind: (f, lean) =>
    at(f.ctx, { x: JUDGE[0], y: JUDGE[1] + 6 * lean }, () => f.rive('judge', poseOf(f, lean))),
  over: (f, swing, lean, props) => {
    benchTop(f, swing, props);
    const [x, y] = handAt(swing, lean);
    at(f.ctx, { x, y }, () => f.rive('hand', { timelines: [['boil', boilTime(f.boil)]] }));
  },
};
