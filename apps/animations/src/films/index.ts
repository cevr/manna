// Every film the player and the renderer know about, loaded on demand, and
// the pages the player mounts: each film, each of its shorts (`shorts.ts`)
// under `<film>/shorts/<id>`, and each talk (`talkFilms`: the speaker's own
// take, cut on his words), a film of its own under its folder's name; and
// each cast member's render under `<film>/cast/<member>` (`castPages`: his
// rigs in every kept view of his sheets, for `film concept render`).

import { shortPages } from '@manna/film/canvas';
import { type Films, castPages, narratedFilms, talkFilms } from '@manna/film/player';
import { faces } from './faces.ts';
import { shorts as righteousnessByFaithShorts } from './righteousness-by-faith/shorts.ts';

const righteousnessByFaith = () => import('./righteousness-by-faith/film.ts');
const coldStudies = () => import('./cold-studies/film.ts');
const inItsOrder = () => import('./in-its-order/film.ts');
const inItsOrderCast = () => import('./in-its-order/rigs/cast.ts');

/**
 * The films, by folder: each key names a folder under `src/films`, and the
 * framework loads that film's narration from it and the faces it draws in
 * (`faces.ts`) with it (`narratedFilms`). A talk's folder is listed in
 * `talkFilms` by its edit (`() => import('./<talk>/talk.ts')`): its takes
 * are read from the footage library, as the tools read them.
 */
export const films = narratedFilms(
  {
    'righteousness-by-faith': righteousnessByFaith,
    'cold-studies': coldStudies,
    'in-its-order': inItsOrder,
    ...talkFilms({}),
  },
  faces,
);

/** Every page the player serves: the films, each film's shorts, and each film's cast renders (`film concept render`). */
export const pages = {
  ...films,
  ...shortPages(
    'righteousness-by-faith',
    films['righteousness-by-faith'],
    righteousnessByFaithShorts,
  ),
  ...castPages(
    'in-its-order',
    [
      'lead-feast',
      'feast-mother',
      'idea-villagers',
      'paul',
      'sower',
      'villager-child',
      'villager-toddler',
    ],
    inItsOrderCast,
  ),
} satisfies Films;
