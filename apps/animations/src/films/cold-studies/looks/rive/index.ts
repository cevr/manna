import { LIGHT } from '../../../righteousness-by-faith/light.ts';
import type { Look } from '../../look.ts';
import { courtWith } from '../cutpaper/court.ts';
import { card, job } from '../cutpaper/job.ts';
import { riveAccused } from './accused.ts';
import { accusedProp } from './rigs.ts';

export const rive: Look = {
  court: courtWith(riveAccused),
  rigs: { accused: accusedProp('canvas') },
  job,
  card,
  light: LIGHT.room,
};
export const rivegl: Look = {
  court: courtWith(riveAccused),
  rigs: { accused: accusedProp('webgl2') },
  job,
  card,
  light: LIGHT.room,
};
