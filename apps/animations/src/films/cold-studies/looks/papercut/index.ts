import type { RiveEngine } from '@manna/film/rive';
import { LIGHT } from '../../../righteousness-by-faith/light.ts';
import type { Look } from '../../look.ts';
import { hues, ramps } from '../../palette.ts';
import { type Props, courtWith } from '../cutpaper/court.ts';
import { card, job } from '../cutpaper/job.ts';
import { riveAccused } from '../rive/accused.ts';
import { riveJudge } from '../rive/judge.ts';
import { accusedProp, handProp, judgeProp } from '../rive/rigs.ts';

const PROPS: Props = {
  bench: hues.bench,
  rim: hues.rim,
  panel: hues.panel,
  block: hues.block,
  sheets: hues.sheets,
  sheetInk: ramps.ink.base,
  blockInk: ramps.ink.base,
  gavelInk: ramps.ink.base,
};

const papercutOn = (engine: RiveEngine): Look => ({
  court: courtWith(riveAccused, riveJudge, PROPS),
  rigs: { accused: accusedProp(engine), judge: judgeProp(engine), hand: handProp(engine) },
  job,
  card,
  light: LIGHT.room,
});

export const papercut = papercutOn('canvas');
export const papercutgl = papercutOn('webgl2');
