import cell0 from './cells/neutral.png' with { type: 'file' };
import cell1 from './cells/neutralBlink.png' with { type: 'file' };
import cell2 from './cells/talk.png' with { type: 'file' };

/** Each cell of this sheet as a film draws it: its PNG, its size in px, its soles’ centre and its head (crown to collar) in px where its lines read one. Written by `storybook draw` and `storybook resplit`. */
export const CELLS = {
  neutral: { png: cell0, size: [465, 1024], ax: 210.5, ay: 964, head: 323 },
  neutralBlink: { png: cell1, size: [512, 1024], ax: 257.5, ay: 964, head: 323 },
  talk: { png: cell2, size: [467, 1024], ax: 256.5, ay: 964, head: 325 },
} as const;
