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
