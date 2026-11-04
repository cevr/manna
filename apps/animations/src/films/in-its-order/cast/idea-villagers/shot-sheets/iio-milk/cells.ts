import cell0 from './cells/cup.png' with { type: 'file' };
import cell1 from './cells/cupBlink.png' with { type: 'file' };
import cell2 from './cells/look.png' with { type: 'file' };
import cell3 from './cells/wave.png' with { type: 'file' };
import cell4 from './cells/drink.png' with { type: 'file' };

/** Each cell of this sheet as a film draws it: its PNG, its size in px, its soles’ centre and its head (crown to collar) in px where its lines read one. Written by `storybook draw` and `storybook resplit`. */
export const CELLS = {
  cup: { png: cell0, size: [270, 1024], ax: 121.5, ay: 839, head: 242 },
  cupBlink: { png: cell1, size: [298, 1024], ax: 151.5, ay: 839, head: 242 },
  look: { png: cell2, size: [296, 1024], ax: 154.5, ay: 839, head: 244 },
  wave: { png: cell3, size: [339, 1024], ax: 155.5, ay: 839, head: 241 },
  drink: { png: cell4, size: [258, 1024], ax: 138.5, ay: 839 },
} as const;
