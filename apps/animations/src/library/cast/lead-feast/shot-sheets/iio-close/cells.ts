import cell0 from './cells/down.png' with { type: 'file' };
import cell1 from './cells/downBlink.png' with { type: 'file' };
import cell2 from './cells/wince.png' with { type: 'file' };

/** Each cell of this sheet as a film draws it: its PNG, its size in px, its soles’ centre and its head (crown to collar) in px where its lines read one. Written by `storybook draw` and `storybook resplit`. */
export const CELLS = {
  down: { png: cell0, size: [458, 1024], ax: 202.5, ay: 985, head: 334 },
  downBlink: { png: cell1, size: [512, 1024], ax: 257.5, ay: 985, head: 334 },
  wince: { png: cell2, size: [459, 1024], ax: 256.5, ay: 985, head: 334 },
} as const;
