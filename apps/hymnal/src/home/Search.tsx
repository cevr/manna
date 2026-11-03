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

const unseen = { pointerEvents: 'none', 'aria-hidden': true } as const;

const styles = StyleSheet.create({
  search: { ...StyleSheet.absoluteFill, backgroundColor: color.ground },
  unseen: { opacity: 0 },
});
