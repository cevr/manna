import cell0 from './cells/sit.png' with { type: 'file' };
import cell1 from './cells/sitBlink.png' with { type: 'file' };
import cell2 from './cells/drink.png' with { type: 'file' };

/** Each cell of this sheet as a film draws it: its PNG, its size in px, its soles’ centre and its head (crown to collar) in px where its lines read one. Written by `storybook draw` and `storybook resplit`. */
export const CELLS = {
  sit: { png: cell0, size: [463, 1024], ax: 207.5, ay: 784, head: 321 },
  sitBlink: { png: cell1, size: [512, 1024], ax: 257.5, ay: 783, head: 323 },
  drink: { png: cell2, size: [467, 1024], ax: 259.5, ay: 784, head: 233 },
} as const;
