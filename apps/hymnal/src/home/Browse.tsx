import type { Href } from 'one';

import { hymnAt, hymns } from '~/hymns/hymns';
import { HymnList } from '~/reader/HymnList';
import { hymnsOffset } from '~/reader/place';

export const hymnHref = (n: number): Href => `/hymns/${n}`;

export const hymnOf = (n: number) => hymnAt(String(n));

export function Browse() {
  return <HymnList hymns={hymns} hrefOf={hymnHref} offset={hymnsOffset} />;
}
