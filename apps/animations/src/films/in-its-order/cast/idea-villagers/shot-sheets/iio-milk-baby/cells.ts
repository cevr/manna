import cell0 from './cells/sit.png' with { type: 'file' };
import cell1 from './cells/sitBlink.png' with { type: 'file' };
import cell2 from './cells/drink.png' with { type: 'file' };

/** Each cell of this sheet as a film draws it: its PNG, its size in px, its soles’ centre and its head (crown to collar) in px where its lines read one. Written by `storybook draw` and `storybook resplit`. */
export const CELLS = {
  sit: { png: cell0, size: [461, 1024], ax: 206.5, ay: 829, head: 331 },
  sitBlink: { png: cell1, size: [505, 1024], ax: 250.5, ay: 829, head: 339 },
  drink: { png: cell2, size: [462, 1024], ax: 252.5, ay: 829, head: 332 },
} as const;
