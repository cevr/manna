import { useAtom, useAtomSet, useAtomSubscribe, useAtomValue } from '@effect/atom-react';
import { Link, useLinkTo, useSafeAreaInsets } from 'one';
import { Option } from 'effect';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import bundled from 'virtual:hymnal-indexes';

import { hymns } from '~/hymns/hymns';
import { groupOffset, groupStarts, HymnList } from '~/reader/HymnList.native';
import { shelvesOf } from '~/reader/lists';
import { hymnsOffset, openAtTopic } from '~/reader/place';
import { settings } from '~/store';
import { color } from '~/color';
import { plain, useCue } from '~/feel/cue';

import { AllAtOnce } from './AllAtOnce';
import { hymnHref, hymnOf } from './Browse';
import { showTiles, type Stood, Tiles, tiles } from './finding';
import { Gear } from './Gear';
import { PinnedTabs, type TabReveal, useTabReveal } from './PinnedTabs';
import { usePinch } from './pinch';
import { TabRow, tabRowHeight } from './TabRow';
import { groupAt, openingOffset, type TabName, tabNamed, tabsOf } from './tabs';

const outOfReach = { pointerEvents: 'none', 'aria-hidden': true } as const;

const titleLine = 41;
const titleSpace = 8;

export function Home() {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const title = Math.ceil(titleLine * fontScale) + titleSpace;
  const scroll = useSharedValue(0);
  const reveal = useTabReveal(scroll, title, tabRowHeight(fontScale));
  const shown = useAtomValue(tiles);
  const { zoomOut, zoomIn } = useZoom(scroll, reveal.cover);
  const zoom = Option.liftPredicate(shown, Tiles.$is('Shown')).pipe(
    Option.map(({ stood }) => stood),
  );
  return (
    <GestureHandlerRootView style={styles.screen}>
      <View style={[styles.below, { marginTop: insets.top }]}>
        <TabList
          title={title}
          scroll={scroll}
          reveal={reveal}
          zoom={zoom}
          onZoomOut={zoomOut}
          onZoomIn={zoomIn}
        >
          <Title height={title} scroll={scroll} onAllAtOnce={zoomOut} />
        </TabList>
      </View>
      {}
      <View style={[styles.scrim, { height: insets.top }]} />
    </GestureHandlerRootView>
  );
}

export const useZoom = (scroll: SharedValue<number>, cover: SharedValue<number>) => {
  const setTiles = useAtomSet(tiles);
  const cue = useCue();
  const zoomOut = () => {
    cue(plain('zoom-out'));
    setTiles((state) => showTiles(state, { offset: scroll.value, cover: cover.value }));
  };
  const zoomIn = () => {
    cue(plain('zoom-in'));
    setTiles(Tiles.Hidden());
  };
  return { zoomOut, zoomIn };
};

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
  readonly zoom: Option.Option<Stood>;
  readonly onZoomOut: () => void;
  readonly onZoomIn: () => void;
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
  const tabRow = <TabRow names={tabs.map((t) => t.name)} selected={tab.name} onSelect={choose} />;
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
    onTouch: reveal.touch,
  };
  const pinch = usePinch({
    testID: 'list-pinch',
    act: 'zoomOut',
    enabled: Option.isNone(zoom),
    onCommit: onZoomOut,
  });
  return (
    <UnderTiles tiles={Option.map(zoom, allAtOnce)}>
      <GestureDetector gesture={pinch}>
        <View style={styles.fill}>
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
        </View>
      </GestureDetector>
    </UnderTiles>
  );
}

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

const ALL_AT_ONCE = { name: 'allAtOnce', label: 'All at once' } as const;

export function Title({
  height,
  scroll,
  onAllAtOnce,
}: {
  readonly height: number;
  readonly scroll: SharedValue<number>;
  readonly onAllAtOnce: () => void;
}) {
  const settings = useLinkTo({ href: Link.resolveHref('/settings') });
  const moved = useAnimatedStyle(() => {
    'worklet';
    return { transform: [{ translateY: -scroll.value }] };
  });
  return (
    <Animated.View pointerEvents="box-none" style={[styles.title, { height }, moved]}>
      <View pointerEvents="none" style={styles.titleText}>
        <Text
          role="heading"
          aria-level={1}
          accessibilityActions={[ALL_AT_ONCE]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === ALL_AT_ONCE.name) onAllAtOnce();
          }}
          style={styles.titleWords}
          numberOfLines={1}
        >
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
});
