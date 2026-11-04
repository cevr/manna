import cell0 from './cells/neutral.png' with { type: 'file' };
import cell1 from './cells/neutralBlink.png' with { type: 'file' };
import cell2 from './cells/talk.png' with { type: 'file' };

/** Each cell of this sheet as a film draws it: its PNG, its size in px, its soles’ centre and its head (crown to collar) in px where its lines read one. Written by `storybook draw` and `storybook resplit`. */
export const CELLS = {
  neutral: { png: cell0, size: [434, 1024], ax: 192.5, ay: 939, head: 304 },
  neutralBlink: { png: cell1, size: [483, 1024], ax: 241.5, ay: 939, head: 303 },
  talk: { png: cell2, size: [435, 1024], ax: 242.5, ay: 939, head: 302 },
} as const;
