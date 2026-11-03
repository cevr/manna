import { Effect } from 'effect';
import { mountRender } from '../../player/render.ts';
import { CROWD, crowdFilm } from './crowd-film.ts';
import { FOOTAGE, footageFilm } from './footage-film.ts';
import { PROBE, probeFilm } from './probe-film.ts';
import { TALK, talkFilm } from './talk-film.ts';

mountRender({
  [PROBE]: Effect.sync(probeFilm),
  [CROWD]: Effect.sync(crowdFilm),
  [FOOTAGE]: Effect.sync(footageFilm),
  [TALK]: talkFilm,
});
