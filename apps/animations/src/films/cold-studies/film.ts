// The looks study: Righteousness by Faith's cold open, its first sentences
// and Job's question, drawn in the look `palette.ts` plays.

import { createFilm } from '@manna/film/canvas';
import type { Narrated } from '@manna/film/player';
import { fonts, palette } from './palette.ts';
import { scenes } from './scenes/index.ts';
import { TITLE } from './script.ts';

/** The frames a second the film is laid and drawn at: its page (`narratedFilms`) and the tools both read it here. */
export const fps = 30;

/** The film, from its narration (its timings, its master, its `fps`) as the framework loads it (`narratedFilms`). */
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
