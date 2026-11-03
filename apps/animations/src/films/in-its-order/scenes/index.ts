import { type SceneSpec, scenesOf } from '@manna/film/canvas';
import { fonts } from '../palette.ts';
import { script } from '../script.ts';
import { cold } from './cold.ts';
import { milk } from './milk.ts';
import { title } from './title.ts';

export const scenes: SceneSpec[] = scenesOf(script, {
  drawings: { cold, milk, title },
  card: { brief: fonts.display, label: fonts.body },
});
