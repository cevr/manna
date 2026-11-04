import cell0 from './cells/front.png' with { type: 'file' };
import cell1 from './cells/frontBlink.png' with { type: 'file' };
import cell2 from './cells/lift.png' with { type: 'file' };
import cell3 from './cells/bottle.png' with { type: 'file' };
import cell4 from './cells/down.png' with { type: 'file' };
import cell5 from './cells/downBlink.png' with { type: 'file' };

/** Each cell of this sheet as a film draws it: its PNG, its size in px, its soles’ centre and its head (crown to collar) in px where its lines read one. Written by `storybook draw` and `storybook resplit`. */
export const CELLS = {
  front: { png: cell0, size: [234, 1024], ax: 109.5, ay: 796, head: 231 },
  frontBlink: { png: cell1, size: [251, 1024], ax: 127.5, ay: 797, head: 231 },
  lift: { png: cell2, size: [248, 1024], ax: 124.5, ay: 797, head: 231 },
  bottle: { png: cell3, size: [266, 1024], ax: 126.5, ay: 797, head: 231 },
  down: { png: cell4, size: [243, 1024], ax: 117.5, ay: 797, head: 220 },
  downBlink: { png: cell5, size: [236, 1024], ax: 127.5, ay: 797, head: 221 },
} as const;
