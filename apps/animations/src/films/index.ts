import { shortPages } from '@manna/film/canvas';
import { type Films, castPages, narratedFilms, talkFilms } from '@manna/film/player';
import { faces } from './faces.ts';
import { shorts as righteousnessByFaithShorts } from './righteousness-by-faith/shorts.ts';

const righteousnessByFaith = () => import('./righteousness-by-faith/film.ts');
const coldStudies = () => import('./cold-studies/film.ts');
const inItsOrder = () => import('./in-its-order/film.ts');
const inItsOrderCast = () => import('./in-its-order/rigs/cast.ts');

export const films = narratedFilms(
  {
    'righteousness-by-faith': righteousnessByFaith,
    'cold-studies': coldStudies,
    'in-its-order': inItsOrder,
    ...talkFilms({}),
  },
  faces,
);

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
      'feast-guest-man',
      'feast-guest-woman',
      'filler-bases',
      'idea-villagers',
      'paul',
      'jeremiah',
      'sower',
      'villager-child',
      'villager-toddler',
    ],
    inItsOrderCast,
  ),
} satisfies Films;
