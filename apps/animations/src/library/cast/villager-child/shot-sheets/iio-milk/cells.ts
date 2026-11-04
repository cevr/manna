import cell0 from './cells/hold.png' with { type: 'file' };
import cell1 from './cells/holdBlink.png' with { type: 'file' };
import cell2 from './cells/drink.png' with { type: 'file' };

/** Each cell of this sheet as a film draws it: its PNG, its size in px, its soles’ centre and its head (crown to collar) in px where its lines read one. Written by `storybook draw` and `storybook resplit`. */
export const CELLS = {
  hold: { png: cell0, size: [430, 1024], ax: 175.5, ay: 977, head: 380 },
  holdBlink: { png: cell1, size: [513, 1024], ax: 257.5, ay: 977, head: 380 },
  drink: { png: cell2, size: [431, 1024], ax: 256.5, ay: 977 },
} as const;
