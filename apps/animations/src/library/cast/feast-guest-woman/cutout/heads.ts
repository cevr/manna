// The woman's head keys on her poses-1 cut-out: her kept turn and smile heads
// (`heads-cut.ts`), each cut by her poses-1 head rule onto that part sheet's
// canvas at its size, so a look lays it in place of her head part
// (`{ part: 'head', drawing: 'turn' | 'smile', place: { s: 1, dx: 0, dy: 0 },
// pivot }`), riding her head's bones. The loader un-mattes each from the paper
// as it does the head part. Pure data.

import type { PuppetSpec } from '@manna/film/canvas';
import headSmile from './sheets/poses-1/head-smile.png' with { type: 'file' };
import headTurn from './sheets/poses-1/head-turn.png' with { type: 'file' };
import { PUPPETS } from './puppets.ts';

/** Her poses-1 puppet with its head keys: turned to the lead (`turn`), and smiling at him (`smile`). */
export const HEADED = {
  ...PUPPETS['poses-1'],
  drawings: [
    { name: 'turn', png: headTurn, part: 'head' },
    { name: 'smile', png: headSmile, part: 'head' },
  ],
} as const satisfies PuppetSpec;
