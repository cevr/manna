import { useAtomSet } from '@effect/atom-react';
import bundled from 'virtual:hymnal-chords';
import { Option, Record } from 'effect';
import { useEffect } from 'react';

import { chordBook } from '~/hymns/chords';
import { hymnAt, hymns } from '~/hymns/hymns';
import { useShowsPage } from '~/player/page';
import type { Track } from '~/player/player';
import type { Header, Headers, RouteParams } from '~/stack';
import { settings } from '~/store';

import type { ChordReader } from './HymnPage';
import { visited } from './lists';

export const reader: ChordReader = {
  chords: settings.chords,
  style: settings.chordStyle,
  placement: settings.placement,
  placementFor: settings.placementFor,
  effectivePlacement: settings.effectivePlacement,
  move: settings.move,
  book: chordBook(bundled),
  reading: settings.reading,
  favourites: settings.lists.favourites,
};

export const hymnHeader = (params: RouteParams): Header => {
  const asked = Option.getOrElse(Record.get(params, 'number'), () => '');
  return Option.match(hymnAt(asked), {
    onNone: () => ({ title: `No hymn ${asked}`.trim() }),
    onSome: (hymn) => ({ title: hymn.title }),
  });
};

export const stackHeaders: Headers = { 'hymns/[number]': hymnHeader };

export const hymnParams = () => hymns.map((hymn) => ({ number: String(hymn.number) }));

export function Shown({ hymn }: { readonly hymn: Track }) {
  useShowsPage(hymn);
  const recent = useAtomSet(settings.lists.recent);
  useEffect(() => recent((now) => visited(now, hymn.number)), [recent, hymn.number]);
  return <></>;
}
