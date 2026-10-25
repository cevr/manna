/**
 * The hymn page the reader sees, for the bottom bar and the player sheet:
 * each hymn page says so while its screen's effects run (`useShowsPage`),
 * and the page on top is the one the reader came to last.
 *
 * The stack pauses a screen it hides (React Navigation's `inactiveBehavior`
 * `pause`): the screen's effects are cleaned up, and run again when it
 * shows. A sheet opened over a page pauses the page under that one, and
 * the sheet's close runs the lower page's effects again, as a mount with
 * no focus. So a page
 * that mounts while its screen is focused (a push, a page turn, a back to
 * it) goes on top, and a page that mounts unfocused goes under every page
 * shown. A phone's sheet over a page (Settings, the player, a chord) leaves
 * the page under it on top, so the docked bar keeps acting on it there.
 */

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Array as Arr, Data, Match, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import { useNavigation } from 'one';
import { useEffect } from 'react';

import type { Track } from './player';

/** One page whose effects run: its hymn, and a mark of its own, as one hymn may be pushed twice. */
export interface Page {
  readonly mark: symbol;
  readonly track: Track;
}

export type PageEvent = Data.TaggedEnum<{
  /** A page's effects ran: it was pushed, turned to, or shown again; `focused` if its screen is. */
  Mounted: { readonly page: Page; readonly focused: boolean };
  /** A page's effects were cleaned up: it went, turned away, or was paused. */
  Unmounted: { readonly mark: symbol };
}>;
export const PageEvent = Data.taggedEnum<PageEvent>();

/** The pages whose effects run, the one the reader came to last at the end, after `event`. */
export const pagesAfter = (pages: ReadonlyArray<Page>, event: PageEvent): ReadonlyArray<Page> =>
  PageEvent.$match(event, {
    Mounted: ({ page, focused }) =>
      Match.value(focused).pipe(
        Match.when(true, () => [...pages, page]),
        Match.orElse(() => [page, ...pages]),
      ),
    Unmounted: ({ mark }) => pages.filter((page) => page.mark !== mark),
  });

/** The hymn page on top among `pages`, if there is one. */
export const shownAmong = (pages: ReadonlyArray<Page>): Option.Option<Track> =>
  Option.map(Arr.last(pages), (page) => page.track);

const shownPages = Atom.make<ReadonlyArray<Page>>([]).pipe(Atom.keepAlive);

/** Says that `track`'s page is shown while the calling screen's effects run. */
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

/** The hymn page on top, if one is shown. */
export const useShownPage = (): Option.Option<Track> => shownAmong(useAtomValue(shownPages));
