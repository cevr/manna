/**
 * The open search's results, drawn by `StackBottom` over the stack on the
 * screen the search opened on, the home list or a hymn page, from under the
 * status bar to the stack's bottom; the find bar, which holds the search box
 * and Cancel, stands over them. They list the hymns the query finds, each
 * found by a line other than its title showing that line. On the home list
 * a row pushes its hymn; they stay mounted, unseen, under it, so Back
 * returns to them at the same scroll place, with the same hymns about the
 * query. On a hymn page a row puts its hymn in the page's place, and the
 * page's own hymn moves nothing (`openingAt`); either closes the search, as
 * Cancel does, so no results wait on a hymn left or stand over the one shown.
 * An empty query lists nothing: the results' ground covers the screen
 * beneath, which stays in place.
 *
 * Search builds the search's index (`hymnIndex`) once it is on screen,
 * while the box's keyboard comes up, and reads the meaning table in a timer
 * task after it (`readMeaningSoon`), so neither the first keystroke nor the
 * first pause waits on them and no one task holds the thread for both; the
 * app's start never does. After a pause in the typing (`afterPause`), the
 * hymns about the query stand under its strongest matches.
 */

import { useAtomValue } from '@effect/atom-react';
import { Effect, Fiber, Option } from 'effect';
import { useSafeAreaInsets } from 'one';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

import { color } from '~/color';
import { hymnAt } from '~/hymns/hymns';
import { aboutQuery, aboutShown, afterPause, readMeaningSoon } from '~/hymns/meaning';
import { find, hymnIndex } from '~/hymns/search';
import { HymnList, type RowOpening } from '~/reader/HymnList.native';
import { searchOffset, searchOpen, searchQuery } from '~/reader/place';

import { searchBack } from './back';
import { hymnHref } from './Browse';
import { useCancelSearch } from './FindBar';
import { openingAt } from './opening';

/** The search's results, seen and in reach while `here`: their screen shows, not a hymn pushed from them. */
export function Search({ here }: { readonly here: boolean }) {
  const query = useAtomValue(searchQuery);
  const shown = useDeferredValue(query);
  const top = Math.max(useSafeAreaInsets().top, 0);
  const results = useMemo(() => {
    const found = Option.match(
      Option.liftPredicate(shown, (q) => q !== ''),
      {
        onNone: () => [],
        onSome: (q) => find(hymnIndex(), q),
      },
    );
    return {
      hymns: found.map((f) => f.hymn),
      lines: new Map(
        found.flatMap((f) => Option.toArray(f.line).map((line) => [f.hymn.number, line] as const)),
      ),
    };
  }, [shown]);
  // The hymns about the query wait for a pause in the typing, and show only for the query shown.
  const [asked, setAsked] = useState('');
  useEffect(() => {
    const pause = Effect.runFork(
      afterPause(query).pipe(Effect.tap((paused) => Effect.sync(() => setAsked(paused)))),
    );
    return () => {
      Effect.runFork(Fiber.interrupt(pause));
    };
  }, [query]);
  const near = useMemo(
    () => aboutQuery(asked).flatMap((n) => Option.toArray(hymnAt(String(n)))),
    [asked],
  );
  const about = useMemo(() => aboutShown(asked, shown, near), [near, asked, shown]);
  const cancel = useCancelSearch();
  // Cancel as it stands at the press, so the rows' opening is made again only for a new path.
  const cancelNow = useRef(cancel);
  useEffect(() => {
    cancelNow.current = cancel;
  });
  const path = Option.match(useAtomValue(searchOpen), {
    onNone: () => '',
    onSome: (searching) => searching.path,
  });
  const opening = useMemo(
    (): RowOpening => ({
      of: (n) => openingAt(path, n),
      // A replace or a stay leaves no search open: its results would wait on the hymn left.
      opened: (how) => {
        if (how !== 'push') cancelNow.current();
      },
    }),
    [path],
  );
  useEffect(() => {
    hymnIndex();
    return readMeaningSoon();
  }, []);
  // Android's Back cancels the search only while its own screen shows; under a pushed hymn the stack pops it.
  useEffect(() => {
    if (!here) return;
    const back = BackHandler.addEventListener(
      'hardwareBackPress',
      searchBack({ isFocused: () => true, cancel }),
    );
    return () => back.remove();
  }, [here]);
  return (
    <View
      testID="search"
      style={[styles.search, { paddingTop: top }, !here && styles.unseen]}
      {...(!here && unseen)}
    >
      {shown !== '' && (
        // A new query's results open at their top.
        <HymnList
          key={shown}
          hymns={results.hymns}
          lines={results.lines}
          about={about}
          hrefOf={hymnHref}
          opening={opening}
          offset={searchOffset}
          empty={`No hymn matches “${shown}”.`}
        />
      )}
    </View>
  );
}

/** The results under a hymn pushed from them: untouchable and unseen by assistive technology. */
const unseen = { pointerEvents: 'none', 'aria-hidden': true } as const;

const styles = StyleSheet.create({
  search: { ...StyleSheet.absoluteFill, backgroundColor: color.ground },
  // Transparent, not `display: none`: the views stay in the window, so the list keeps its scroll offset.
  unseen: { opacity: 0 },
});
