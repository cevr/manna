import cell0 from './cells/down.png' with { type: 'file' };
import cell1 from './cells/downBlink.png' with { type: 'file' };
import cell2 from './cells/wince.png' with { type: 'file' };

/** Each cell of this sheet as a film draws it: its PNG, its size in px, its soles’ centre and its head (crown to collar) in px where its lines read one. Written by `storybook draw` and `storybook resplit`. */
export const CELLS = {
  down: { png: cell0, size: [478, 1024], ax: 223.5, ay: 998, head: 351 },
  downBlink: { png: cell1, size: [508, 1024], ax: 256.5, ay: 998, head: 351 },
  wince: { png: cell2, size: [476, 1024], ax: 252.5, ay: 998, head: 351 },
} as const;
