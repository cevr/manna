import cell0 from './cells/front.png' with { type: 'file' };
import cell1 from './cells/frontBlink.png' with { type: 'file' };
import cell2 from './cells/lift.png' with { type: 'file' };
import cell3 from './cells/cup.png' with { type: 'file' };

/** Each cell of this sheet as a film draws it: its PNG, its size in px, its soles’ centre and its head (crown to collar) in px where its lines read one. Written by `storybook draw` and `storybook resplit`. */
export const CELLS = {
  front: { png: cell0, size: [346, 1024], ax: 162.5, ay: 945, head: 284 },
  frontBlink: { png: cell1, size: [368, 1024], ax: 183.5, ay: 945, head: 285 },
  lift: { png: cell2, size: [370, 1024], ax: 183.5, ay: 945, head: 286 },
  cup: { png: cell3, size: [341, 1024], ax: 182.5, ay: 945, head: 286 },
} as const;
