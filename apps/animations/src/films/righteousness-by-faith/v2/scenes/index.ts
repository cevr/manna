import { type SceneSpec, scenesOf } from '@manna/film/canvas';
import { lightOf } from '../light.ts';
import { fonts } from '../../palette.ts';
import { script } from '../script.ts';
import { accuser } from './accuser.ts';
import { centurion } from './centurion.ts';
import { cold } from './cold.ts';
import { daily } from './daily.ts';
import { declared } from './declared.ts';
import { end } from './end.ts';
import { exchange } from './exchange.ts';
import { look } from './look.ts';
import { message } from './message.ts';
import { mirror } from './mirror.ts';
import { name } from './name.ts';
import { rain } from './rain.ts';
import { robe } from './robe.ts';
import { roof } from './roof.ts';
import { spoke } from './spoke.ts';
import { thesis } from './thesis.ts';
import { title } from './title.ts';
import { within } from './within.ts';
import { woman } from './woman.ts';
import { word } from './word.ts';

export const scenes: SceneSpec[] = scenesOf(script, {
  drawings: {
    accuser,
    centurion,
    cold,
    daily,
    declared,
    end,
    exchange,
    look,
    message,
    mirror,
    name,
    rain,
    robe,
    roof,
    spoke,
    thesis,
    title,
    within,
    woman,
    word,
  },
  light: lightOf,
  card: { brief: fonts.display, label: fonts.body },
});
