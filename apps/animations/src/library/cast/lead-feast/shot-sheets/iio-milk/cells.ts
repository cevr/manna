import cell0 from './cells/front.png' with { type: 'file' };
import cell1 from './cells/frontBlink.png' with { type: 'file' };
import cell2 from './cells/lift.png' with { type: 'file' };
import cell3 from './cells/cup.png' with { type: 'file' };

/** Each cell of this sheet as a film draws it: its PNG, its size in px, its soles’ centre and its head (crown to collar) in px where its lines read one. Written by `storybook draw` and `storybook resplit`. */
export const CELLS = {
  front: { png: cell0, size: [352, 1024], ax: 161.5, ay: 949, head: 301 },
  frontBlink: { png: cell1, size: [379, 1024], ax: 190.5, ay: 949, head: 301 },
  lift: { png: cell2, size: [374, 1024], ax: 189.5, ay: 949, head: 300 },
  cup: { png: cell3, size: [347, 1024], ax: 192.5, ay: 950, head: 300 },
} as const;
