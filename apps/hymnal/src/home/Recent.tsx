import { useAtomValue } from '@effect/atom-react';
import { useMemo } from 'react';

import { HymnList } from '~/reader/HymnList';
import { recentOf } from '~/reader/lists';
import { recentOffset } from '~/reader/place';
import { settings } from '~/store';

import { hymnHref, hymnOf } from './Browse';

export function Recent() {
  const recent = useAtomValue(settings.lists.recent);
  const favourites = useAtomValue(settings.lists.favourites);
  const kept = useMemo(() => recentOf(recent, hymnOf), [recent]);
  const starred = useMemo(() => new Set(favourites), [favourites]);
  return (
    <HymnList
      hymns={kept}
      hrefOf={hymnHref}
      offset={recentOffset}
      favourites={starred}
      empty="The hymns you open show here."
    />
  );
}
