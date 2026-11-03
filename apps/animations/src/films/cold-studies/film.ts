import { createFilm } from '@manna/film/canvas';
import type { Narrated } from '@manna/film/player';
import { fonts, palette } from './palette.ts';
import { scenes } from './scenes/index.ts';
import { TITLE } from './script.ts';

export const fps = 30;

export const film = (narrated: Narrated) =>
  createFilm({
    ...narrated,
    title: TITLE,
    paper: { base: palette.paper, tone: palette.paperTone, seed: 1888 },
    shade: palette.shade,
    scenes,
    palette,
    captions: { font: `500 38px "${fonts.body}"`, color: palette.ink, plate: palette.plate },
  });
