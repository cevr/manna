import cell0 from './cells/cup.png' with { type: 'file' };
import cell1 from './cells/sip.png' with { type: 'file' };
import cell2 from './cells/cupBlink.png' with { type: 'file' };

/** Each cell of this sheet as a film draws it: its PNG, its size in px, its soles’ centre and its head (crown to collar) in px where its lines read one. Written by `storybook draw` and `storybook resplit`. */
export const CELLS = {
  cup: { png: cell0, size: [476, 1024], ax: 220.5, ay: 981, head: 395 },
  sip: { png: cell1, size: [512, 1024], ax: 256.5, ay: 981, head: 395 },
  cupBlink: { png: cell2, size: [478, 1024], ax: 256.5, ay: 981, head: 395 },
} as const;
