import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Array as Arr, Data, Match, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import { useNavigation } from 'one';
import { useEffect } from 'react';

import type { Track } from './player';

export interface Page {
  readonly mark: symbol;
  readonly track: Track;
}

export type PageEvent = Data.TaggedEnum<{
  Mounted: { readonly page: Page; readonly focused: boolean };
  Unmounted: { readonly mark: symbol };
}>;
export const PageEvent = Data.taggedEnum<PageEvent>();

export const pagesAfter = (pages: ReadonlyArray<Page>, event: PageEvent): ReadonlyArray<Page> =>
  PageEvent.$match(event, {
    Mounted: ({ page, focused }) =>
      Match.value(focused).pipe(
        Match.when(true, () => [...pages, page]),
        Match.orElse(() => [page, ...pages]),
      ),
    Unmounted: ({ mark }) => pages.filter((page) => page.mark !== mark),
  });

export const shownAmong = (pages: ReadonlyArray<Page>): Option.Option<Track> =>
  Option.map(Arr.last(pages), (page) => page.track);

const shownPages = Atom.make<ReadonlyArray<Page>>([]).pipe(Atom.keepAlive);

export function useShowsPage(track: Track) {
  const set = useAtomSet(shownPages);
  const navigation = useNavigation();
  const { number, title } = track;
  useEffect(() => {
    const page: Page = { mark: Symbol(number), track: { number, title } };
    const focused = navigation.isFocused();
    set((pages) => pagesAfter(pages, PageEvent.Mounted({ page, focused })));
    return () => set((pages) => pagesAfter(pages, PageEvent.Unmounted({ mark: page.mark })));
  }, [set, number, title]);
}

export const useShownPage = (): Option.Option<Track> => shownAmong(useAtomValue(shownPages));
