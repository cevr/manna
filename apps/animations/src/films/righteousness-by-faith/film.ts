// Righteousness by Faith: the rebuild, read by one narrator.

import { createFilm } from '@manna/film/canvas';
import type { Narrated } from '@manna/film/player';
import { CARD_STYLE, VERSE_STYLE } from './card.ts';
import { fonts, palette } from './palette.ts';
import { scenes } from './scenes/index.ts';
import { TITLE } from './script.ts';

/** The film's acts and colour script (`acts.ts`), read by `film check`, `film lookbook` and `film chapters`. */
export { look } from './acts.ts';

/** The frames a second the film is laid and drawn at: its page (`narratedFilms`) and the tools both read it here. */
export const fps = 30;

/** The film, from its narration (its timings, its master, its `fps`) as the framework loads it (`narratedFilms`). */
export const film = (narrated: Narrated) =>
  createFilm({
    ...narrated,
    title: TITLE,
    paper: { base: palette.paper, tone: palette.paperTone, seed: 1888 },
    shade: palette.boardDeep,
    scenes,
    palette,
    captions: { font: `500 38px "${fonts.body}"`, color: palette.ink, plate: palette.robe },
    short: {
      hook: { font: `600 64px "${fonts.display}"`, color: palette.ink },
      caption: { font: `600 60px "${fonts.body}"`, color: palette.ink, highlight: palette.gold },
    },
    card: { style: CARD_STYLE, verse: VERSE_STYLE },
  });
