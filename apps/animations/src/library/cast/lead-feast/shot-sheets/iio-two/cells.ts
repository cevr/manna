import cell0 from './cells/bottle.png' with { type: 'file' };
import cell1 from './cells/grin.png' with { type: 'file' };
import cell2 from './cells/tuck.png' with { type: 'file' };
import cell3 from './cells/ask.png' with { type: 'file' };

/** Each cell of this sheet as a film draws it: its PNG, its size in px, its soles’ centre and its head (crown to collar) in px where its lines read one. Written by `storybook draw` and `storybook resplit`. */
export const CELLS = {
  bottle: { png: cell0, size: [338, 1024], ax: 136.5, ay: 895, head: 275 },
  grin: { png: cell1, size: [384, 1024], ax: 182.5, ay: 895, head: 275 },
  tuck: { png: cell2, size: [374, 1024], ax: 182.5, ay: 895, head: 275 },
  ask: { png: cell3, size: [330, 1024], ax: 193.5, ay: 895, head: 275 },
} as const;
