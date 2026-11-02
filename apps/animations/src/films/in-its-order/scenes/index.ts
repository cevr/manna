// Every beat of the script paired with its drawing by the beat's id
// (`scenesOf`). `title`, `cold` and `milk` have drawings; every other beat
// plays as its storyboard card, so the whole film stays watchable; `film
// check` names each (`Storyboard`). The scenes are built to the film's Board
// (the flow's step 7). Imports nothing that touches the DOM at module load:
// the narrate script reads this to lay out the audio track.

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
