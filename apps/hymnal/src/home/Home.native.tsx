/**
 * A phone's home screen: the title "Hymns" and a settings button over the
 * hymn list. The ways to find a hymn stand in the find bar at the list's
 * foot (`FindBar.tsx`, drawn by the player layer): `Search`, `All at once`
 * and the `#`.
 *
 * The list's content is a spacer the title's height, the row of the list's
 * tabs (`TabList`, `TabRow`), then the rows; the list opens at its top, with
 * the tabs under the title, which is a layer over the list on the ground. On
 * the UI thread the title follows the list's offset: it moves up with the
 * rows, and follows a pull past the top down. The title's text takes no
 * touch, so a drag that starts on it scrolls the list.
 *
 * Deep in the list, an upward scroll pins the tab row over the list's top
 * under the status bar, and a downward one sends it away (`reveal.ts`,
 * `PinnedTabs`): a layer, so the list's content and offset never move for
 * it, with the pinned topic row under it (`PullDown.cover`).
 *
 * A press on the find bar's `Search` enters search mode: the bar grows into
 * the search box, and the results show over the list. A passage tapped in
 * `About this hymn` enters it too, with its query and the keyboard down
 * (`searchOpen`). The list stays mounted beneath, untouchable and hidden
 * from assistive technology, so it keeps its place. The bar's Cancel, or
 * Android's Back while the home screen is in focus (`searchBack`), clears
 * the query and shows the list as it was.
 *
 * The find bar's `All at once` asks for the tiles (`tiles`); the home screen
 * shows them with the list's place read then (`showTiles`).
 */

import { useAtom, useAtomSet, useAtomSubscribe, useAtomValue } from '@effect/atom-react';
import { Link, useLinkTo, useNavigation, useSafeAreaInsets } from 'one';
import { Effect, Fiber, Option } from 'effect';
import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import bundled from 'virtual:hymnal-indexes';

import { hymnAt, hymns } from '~/hymns/hymns';
import { aboutQuery, aboutShown, afterPause, readMeaningSoon } from '~/hymns/meaning';
import { find, hymnIndex } from '~/hymns/search';
import { groupOffset, groupStarts, HymnList } from '~/reader/HymnList.native';
import { shelvesOf } from '~/reader/lists';
import { hymnsOffset, openAtTopic, searchOffset, searchOpen, searchQuery } from '~/reader/place';
import { settings } from '~/store';
import { color } from '~/color';
import { plain, useCue } from '~/feel/cue';

import { AllAtOnce } from './AllAtOnce';
import { searchBack } from './back';
import { hymnHref, hymnOf } from './Browse';
import { useCancelSearch } from './FindBar';
import { showTiles, type Stood, Tiles, tiles } from './finding';
import { Gear } from './Gear';
import { PinnedTabs, type TabReveal, useTabReveal } from './PinnedTabs';
import { TabRow, tabRowHeight } from './TabRow';
import { groupAt, openingOffset, type TabName, tabNamed, tabsOf } from './tabs';

/**
 * A layer out of reach, untouchable and unseen by assistive technology: the
 * list beneath search mode or `All at once` (kept in place). React Native turns `aria-hidden` into
 * `accessibilityElementsHidden` on iOS and `no-hide-descendants` on Android,
 * and the web's renderer writes it as the attribute.
 */
const outOfReach = { pointerEvents: 'none', 'aria-hidden': true } as const;

/** The title row's line (a large title) and the space under it, at the reader's usual text size. */
const titleLine = 41;
const titleSpace = 8;

export function Home() {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const searching = useAtomValue(searchOpen) !== 'off';
  const title = Math.ceil(titleLine * fontScale) + titleSpace;
  const scroll = useSharedValue(0);
  // The pinned tab row rests where the list's own row meets the list's top: one title's height down.
  const reveal = useTabReveal(scroll, title, tabRowHeight(fontScale));
  const [shown, setTiles] = useAtom(tiles);
  const cue = useCue();
  const zoomOut = () => {
    cue(plain('zoom-out'));
    setTiles((state) => showTiles(state, { offset: scroll.value, cover: reveal.cover.value }));
  };
  // The find bar asks for the tiles; the list's place is read here, once, as they show.
  useAtomSubscribe(
    tiles,
    (state) => {
      if (Tiles.$is('Asked')(state)) zoomOut();
    },
    { immediate: true },
  );
  const zoomIn = () => {
    cue(plain('zoom-in'));
    setTiles(Tiles.Hidden());
  };
  const zoom = Option.liftPredicate(shown, Tiles.$is('Shown')).pipe(
    Option.map(({ stood }) => stood),
  );
  return (
    <View style={styles.screen}>
      <View style={[styles.below, { marginTop: insets.top }]}>
        <View style={styles.fill} {...(searching && outOfReach)}>
          <TabList
            title={title}
            scroll={scroll}
            reveal={reveal}
            zoom={zoom}
            onZoomOut={zoomOut}
            onZoomIn={zoomIn}
          >
            <Title height={title} scroll={scroll} />
          </TabList>
        </View>
        {searching && <Search />}
      </View>
      {/* The status bar's ground: rows and the title pass under it unseen. */}
      <View style={[styles.scrim, { height: insets.top }]} />
    </View>
  );
}

/**
 * The hymn list of the tab in use (`settings.home.tab`, `tabNamed`), with
 * the tab row under the title in the list's top. Sections names each
 * section over its hymns under the Recent shelf (`byTopic`); every other tab
 * names its groups (`grouped`). Each tab mounts its own list, and opens where
 * the reader left it in this run of the app, else where the list was when
 * the tab was chosen (`openingOffset`). A topic tapped in `About this hymn`
 * (`openAtTopic`) mounts the Topics tab's list afresh with that topic's row
 * at the top (`groupOffset`), even when Topics is already the tab in use.
 *
 * A tap on a group's row (`onZoomOut`, as the find bar's `All at once`)
 * zooms out to `All at once` over the list, its tiles opened at the group at
 * the list's top when it zoomed out (`zoom`, `groupAt`). A tile mounts the
 * tab's list afresh with that group's row at the top (`groupStarts`).
 * While it shows, the list and the layers over it (the pinned tab row, and
 * `children`: the title) are out of reach beneath it (`UnderTiles`).
 *
 * Deep in the list, an upward scroll pins a copy of the tab row over the
 * list's top under the status bar, and a downward one sends it away
 * (`reveal`, `PinnedTabs`); a tap on a pinned tab chooses it as the list's
 * own row does. A tab chosen or a tile picked moves the list for the app,
 * which turns the pinned row neither way (`jump`).
 */
function TabList({
  title,
  scroll,
  reveal,
  zoom,
  onZoomOut,
  onZoomIn,
  children,
}: {
  readonly title: number;
  readonly scroll: SharedValue<number>;
  readonly reveal: TabReveal;
  /** Where the list stood when it zoomed out to `All at once`, while that shows. */
  readonly zoom: Option.Option<Stood>;
  readonly onZoomOut: () => void;
  readonly onZoomIn: () => void;
  /** The layers drawn over the list, out of reach with it while `All at once` shows. */
  readonly children: ReactNode;
}) {
  const { fontScale } = useWindowDimensions();
  const [chosen, setChosen] = useAtom(settings.home.tab);
  const favourites = useAtomValue(settings.lists.favourites);
  const recent = useAtomValue(settings.lists.recent);
  const tabs = useMemo(
    () => tabsOf({ hymns, favourites, recent, indexes: bundled }),
    [favourites, recent],
  );
  const tab = tabNamed(tabs, chosen);
  const shelves = useMemo(() => shelvesOf(recent, hymnOf), [recent]);
  const starred = useMemo(() => new Set(favourites), [favourites]);
  const kept = useRef(new Map<TabName, number>());
  const [start, setStart] = useState<number>();
  const [visit, setVisit] = useState(0);
  const show = (name: TabName, at: number) => {
    kept.current.set(tab.name, scroll.value);
    reveal.jump(at);
    scroll.value = at;
    setStart(at);
    setChosen(name);
  };
  const choose = (name: TabName) => show(name, openingOffset(kept.current, name, scroll.value));
  // The list's own row, and the pinned copy of it over the list's top.
  const tabRow = <TabRow names={tabs.map((t) => t.name)} selected={tab.name} onSelect={choose} />;
  // The list's head: the title's spacer and the tab row.
  const head = title + tabRowHeight(fontScale);
  const setTopic = useAtomSet(openAtTopic);
  useAtomSubscribe(
    openAtTopic,
    (topic) => {
      if (Option.isNone(topic)) return;
      setTopic(Option.none());
      const at = groupOffset(tabNamed(tabs, 'Topics'), hymns, topic.value, head, fontScale);
      show(
        'Topics',
        Option.getOrElse(at, () => 0),
      );
      setVisit((n) => n + 1);
    },
    { immediate: true },
  );
  const allAtOnce = (stood: Stood) => {
    const starts = groupStarts(
      Option.liftPredicate(tab, (t) => t.name !== 'Sections'),
      hymns,
      shelves,
      head,
      fontScale,
    );
    const pick = (index: number) => {
      onZoomIn();
      show(tab.name, starts[index] ?? 0);
      setVisit((n) => n + 1);
    };
    return (
      <AllAtOnce
        tab={tab}
        at={groupAt(starts, stood.offset, stood.cover)}
        onPick={pick}
        onClose={onZoomIn}
      />
    );
  };
  const pullDown = {
    node: (
      <View style={{ height: head }}>
        <View style={{ height: title }} />
        {tabRow}
      </View>
    ),
    height: head,
    rest: 0,
    scroll,
    cover: reveal.cover,
  };
  return (
    <UnderTiles tiles={Option.map(zoom, allAtOnce)}>
      <HymnList
        key={`${tab.name}:${visit}`}
        hymns={hymns}
        hrefOf={hymnHref}
        offset={hymnsOffset}
        favourites={starred}
        pullDown={pullDown}
        start={start}
        onGroup={onZoomOut}
        {...(tab.name === 'Sections' && { byTopic: true, shelves })}
        {...(tab.name !== 'Sections' && { grouped: tab, empty: 'No hymns here yet.' })}
      />
      <PinnedTabs reveal={reveal}>{tabRow}</PinnedTabs>
      {children}
    </UnderTiles>
  );
}

/**
 * The list and the layers over it (`children`), and `All at once` (`tiles`)
 * over them while it shows. Beneath the tiles they stay mounted in place,
 * untouchable and hidden from assistive technology, so VoiceOver reaches
 * only the tiles' heading, Done and the tiles; once the tiles close, the
 * list is in reach again.
 */
export function UnderTiles({
  tiles,
  children,
}: {
  readonly tiles: Option.Option<ReactNode>;
  readonly children: ReactNode;
}) {
  return (
    <>
      <View style={styles.fill} {...(Option.isSome(tiles) && outOfReach)}>
        {children}
      </View>
      {Option.getOrNull(tiles)}
    </>
  );
}

/** The title and the settings button, moved with the list's offset: up with the rows, and down with a pull past the top. */
function Title({
  height,
  scroll,
}: {
  readonly height: number;
  readonly scroll: SharedValue<number>;
}) {
  const settings = useLinkTo({ href: Link.resolveHref('/settings') });
  const moved = useAnimatedStyle(() => {
    'worklet';
    return { transform: [{ translateY: -scroll.value }] };
  });
  return (
    <Animated.View pointerEvents="box-none" style={[styles.title, { height }, moved]}>
      <View pointerEvents="none" style={styles.titleText}>
        <Text role="heading" aria-level={1} style={styles.titleWords} numberOfLines={1}>
          Hymns
        </Text>
      </View>
      <Pressable
        {...settings}
        role="button"
        aria-label="Settings"
        hitSlop={8}
        style={({ pressed }) => [styles.settings, pressed && styles.pressed]}
      >
        <Gear />
      </Pressable>
    </Animated.View>
  );
}

/**
 * Search mode's results, over the list and above the find bar, which holds
 * the search box and Cancel: the hymns the query finds, each found by a line
 * other than its title showing that line. Search mode builds the search's
 * index (`hymnIndex`) once it is on screen, while the box's keyboard comes
 * up, and reads the meaning table in a timer task after it
 * (`readMeaningSoon`), so neither the first keystroke nor the first pause
 * waits on them and no one task holds the thread for both; the app's start
 * never does. After a pause in the typing (`afterPause`), the hymns
 * about the query stand under its strongest matches.
 */
function Search() {
  const query = useAtomValue(searchQuery);
  const shown = useDeferredValue(query);
  const results = useMemo(() => {
    // An empty query lists nothing here: the list beneath shows instead.
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
  useEffect(() => {
    hymnIndex();
    return readMeaningSoon();
  }, []);
  const navigation = useNavigation();
  useEffect(() => {
    const back = BackHandler.addEventListener(
      'hardwareBackPress',
      searchBack({ isFocused: () => navigation.isFocused(), cancel }),
    );
    return () => back.remove();
  }, []);
  return (
    <View style={styles.search}>
      {shown !== '' && (
        // A new query's results open at their top.
        <HymnList
          key={shown}
          hymns={results.hymns}
          lines={results.lines}
          about={about}
          hrefOf={(n) => `/hymns/${n}`}
          offset={searchOffset}
          empty={`No hymn matches “${shown}”.`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  below: { flex: 1, overflow: 'hidden' },
  fill: { flex: 1 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: color.ground },
  title: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 8,
    backgroundColor: color.ground,
  },
  titleText: { flex: 1 },
  titleWords: { fontSize: 34, lineHeight: titleLine, fontWeight: '700', color: color.ink },
  settings: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  pressed: { opacity: 0.6 },
  search: { ...StyleSheet.absoluteFill, backgroundColor: color.ground },
});
