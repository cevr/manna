/**
 * Every hymn in number order, each opening at `/hymns/<n>`: the web's home
 * list while no search is typed. A phone's home list, with its tabs, topics,
 * Recent shelf and starred Favourites, is `Home.native.tsx`'s own.
 */

import type { Href } from 'one';

import { hymnAt, hymns } from '~/hymns/hymns';
import { HymnList } from '~/reader/HymnList';
import { hymnsOffset } from '~/reader/place';

/** One function for every render, so the rows are drawn again only when what they show changes. */
export const hymnHref = (n: number): Href => `/hymns/${n}`;

/** The hymn numbered `n`, if there is one. */
export const hymnOf = (n: number) => hymnAt(String(n));

export function Browse() {
  return <HymnList hymns={hymns} hrefOf={hymnHref} offset={hymnsOffset} />;
}
