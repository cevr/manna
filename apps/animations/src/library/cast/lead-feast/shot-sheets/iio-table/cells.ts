import cell0 from './cells/front.png' with { type: 'file' };
import cell1 from './cells/frontBlink.png' with { type: 'file' };
import cell2 from './cells/lift.png' with { type: 'file' };
import cell3 from './cells/bottle.png' with { type: 'file' };
import cell4 from './cells/down.png' with { type: 'file' };
import cell5 from './cells/downBlink.png' with { type: 'file' };
import cell6 from './cells/read.png' with { type: 'file' };
import cell7 from './cells/readBlink.png' with { type: 'file' };

/** Each cell of this sheet as a film draws it: its PNG, its size in px, its soles’ centre and its head (crown to collar) in px where its lines read one. Written by `storybook draw` and `storybook resplit`. */
export const CELLS = {
  front: { png: cell0, size: [236, 1024], ax: 111.5, ay: 814, head: 226 },
  frontBlink: { png: cell1, size: [251, 1024], ax: 126.5, ay: 814, head: 226 },
  lift: { png: cell2, size: [253, 1024], ax: 126.5, ay: 814, head: 226 },
  bottle: { png: cell3, size: [259, 1024], ax: 123.5, ay: 814, head: 226 },
  down: { png: cell4, size: [245, 1024], ax: 119.5, ay: 814, head: 226 },
  downBlink: { png: cell5, size: [238, 1024], ax: 128.5, ay: 814, head: 226 },
  read: { png: cell6, size: [441, 1024], ax: 162.5, ay: 814, head: 225 },
  readBlink: { png: cell7, size: [442, 1024], ax: 311.5, ay: 814, head: 225 },
} as const;
