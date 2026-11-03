import { type SceneSpec, scenesOf } from '@manna/film/canvas';
import { fonts } from '../palette.ts';
import { script } from '../script.ts';
import { court } from './court.ts';
import { job } from './job.ts';

export const scenes: SceneSpec[] = scenesOf(script, {
  drawings: { court, job },
  card: { brief: fonts.display, label: fonts.body },
});
