import { type SceneSpec, scenesOf } from '@manna/film/canvas';
import { lightOf } from '../light.ts';
import { fonts } from '../palette.ts';
import { script } from '../script.ts';
import { cold } from './cold.ts';
import { court } from './court.ts';
import { look } from './look.ts';
import { rain } from './rain.ts';
import { seed } from './seed.ts';
import { spoke } from './spoke.ts';
import { title } from './title.ts';
import { within } from './within.ts';
import { word } from './word.ts';

export const scenes: SceneSpec[] = scenesOf(script, {
  drawings: { cold, court, look, rain, seed, spoke, title, within, word },
  light: lightOf,
  card: { brief: fonts.display, label: fonts.body },
});
