import cell0 from './cells/neutral.png' with { type: 'file' };
import cell1 from './cells/neutralBlink.png' with { type: 'file' };
import cell2 from './cells/talk.png' with { type: 'file' };

/** Each cell of this sheet as a film draws it: its PNG, its size in px, its soles’ centre and its head (crown to collar) in px where its lines read one. Written by `storybook draw` and `storybook resplit`. */
export const CELLS = {
  neutral: { png: cell0, size: [455, 1024], ax: 205.5, ay: 970, head: 296 },
  neutralBlink: { png: cell1, size: [502, 1024], ax: 251.5, ay: 970, head: 296 },
  talk: { png: cell2, size: [456, 1024], ax: 251.5, ay: 970, head: 295 },
} as const;
