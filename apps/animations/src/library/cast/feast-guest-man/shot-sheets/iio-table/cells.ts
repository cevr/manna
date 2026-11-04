import cell0 from './cells/neutral.png' with { type: 'file' };
import cell1 from './cells/neutralBlink.png' with { type: 'file' };
import cell2 from './cells/stare.png' with { type: 'file' };
import cell3 from './cells/smile.png' with { type: 'file' };

/** Each cell of this sheet as a film draws it: its PNG, its size in px, its soles’ centre and its head (crown to collar) in px where its lines read one. Written by `storybook draw` and `storybook resplit`. */
export const CELLS = {
  neutral: { png: cell0, size: [369, 1024], ax: 178.5, ay: 829, head: 282 },
  neutralBlink: { png: cell1, size: [384, 1024], ax: 193.5, ay: 829, head: 282 },
  stare: { png: cell2, size: [384, 1024], ax: 192.5, ay: 829, head: 282 },
  smile: { png: cell3, size: [371, 1024], ax: 193.5, ay: 829, head: 282 },
} as const;
