import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import { Option, Predicate } from 'effect';
import { type Href, Link, useLinkTo } from 'one';
import { useEffect, useMemo, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  scrollTo,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  type ColorValue,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { useCue } from '~/feel/cue';
import type { Opening } from '~/home/opening';
import { Find, find } from '~/player/bar';
import { foundOffset } from '~/player/drums';
import { useFindRoom } from '~/player/context';
import { useStackBottom } from '~/player/StackBottom';
import type { HymnText } from '~/hymns/hymns';
import { color, useAccent } from '~/color';

import type { HymnListProps } from './HymnList';
import { listEndSpace } from './end';
import { ListEnd } from './ListEnd';
import { dismissal } from './keyboard';
import { clampedStart, pinnedAt, topicStart, topicStarts } from './pin';
import { pagesFrom } from './place';
import { Rail, useRail } from './Rail';
import { GUTTER, marksOf } from './rail-marks';
import { groupRowsOf, resultRowsOf, type Row, rowsOf } from './rows';

const line = 22;
const padding = 11;

const topicLine = 20;
const topicPadding = 8;

const foundLine = 18;
const foundPadding = 8;

type Drawn = Row<HymnText>['kind'] | 'found';

const drawnAs = (row: Row<HymnText>): Drawn => {
  if (row.kind === 'hymn' && Option.isSome(row.line)) return 'found';
  return row.kind;
};

const heightOf = (drawn: Drawn, fontScale: number) => {
  if (drawn === 'hymn') return Math.ceil(line * fontScale) + 2 * padding;
  if (drawn === 'found')
    return Math.ceil(line * fontScale) + Math.ceil(foundLine * fontScale) + 2 * foundPadding;
  return Math.ceil(topicLine * fontScale) + 2 * topicPadding;
};

interface Look {
  readonly accent: ColorValue;
  readonly hymnHeight: number;
  readonly foundHeight: number;
  readonly topicHeight: number;
  readonly gutter: number;
  readonly hrefOf: HymnListProps['hrefOf'];
  readonly onGroup: Option.Option<() => void>;
  readonly opening: Option.Option<RowOpening>;
}

export interface RowOpening {
  readonly of: (number: number) => Opening;
  readonly opened: (how: Opening) => void;
}

const drawRow = ({
  item,
  extraData,
}: {
  readonly item: Row<HymnText>;
  readonly extraData: Look;
}) => {
  if (item.kind === 'topic')
    return Option.match(extraData.onGroup, {
      onNone: () => (
        <Topic name={item.name} height={extraData.topicHeight} gutter={extraData.gutter} />
      ),
      onSome: (onGroup) => (
        <GroupHeader
          name={item.name}
          height={extraData.topicHeight}
          gutter={extraData.gutter}
          onPress={onGroup}
        />
      ),
    });
  if (item.kind === 'shelf')
    return (
      <ShelfHeader
        name={item.name}
        href={item.href}
        height={extraData.topicHeight}
        gutter={extraData.gutter}
        accent={extraData.accent}
      />
    );
  return (
    <HymnRow
      hymn={item.hymn}
      href={extraData.hrefOf(item.hymn.number)}
      source={item.source}
      favourite={item.favourite}
      line={item.line}
      height={Option.match(item.line, {
        onNone: () => extraData.hymnHeight,
        onSome: () => extraData.foundHeight,
      })}
      gutter={extraData.gutter}
      accent={extraData.accent}
      opening={extraData.opening}
    />
  );
};

export interface Grouped {
  readonly name: string;
  readonly groups: ReadonlyArray<{ readonly name: string; readonly hymns: ReadonlyArray<number> }>;
}

export const groupOffset = (
  grouped: Grouped,
  hymns: ReadonlyArray<HymnText>,
  name: string,
  top: number,
  fontScale: number,
): Option.Option<number> =>
  topicStart(
    groupRowsOf(grouped.name, grouped.groups, hymns).rows,
    top,
    (kind) => heightOf(kind, fontScale),
    name,
  );

export const groupStarts = (
  grouped: Option.Option<Grouped>,
  hymns: ReadonlyArray<HymnText>,
  shelves: HymnListProps['shelves'],
  top: number,
  fontScale: number,
): ReadonlyArray<number> =>
  topicStarts(
    Option.match(grouped, {
      onNone: () => rowsOf(hymns, shelves).rows,
      onSome: (tab) => groupRowsOf(tab.name, tab.groups, hymns).rows,
    }),
    top,
    (kind) => heightOf(kind, fontScale),
  );

export function HymnList({
  hymns,
  hrefOf,
  empty,
  byTopic = false,
  shelves,
  favourites,
  pullDown,
  lines,
  about,
  grouped,
  start,
  onGroup,
  opening: rowOpening,
}: HymnListProps & {
  readonly about?: ReadonlyArray<HymnText>;
  readonly grouped?: Grouped;
  readonly start?: number;
  readonly onGroup?: () => void;
  readonly opening?: RowOpening;
}) {
  const { fontScale, height: viewport } = useWindowDimensions();
  const accent = useAccent();
  const { rows, sticky } = useMemo(() => {
    if (grouped) return groupRowsOf(grouped.name, grouped.groups, hymns, favourites);
    if (byTopic) return rowsOf(hymns, shelves, favourites);
    return resultRowsOf(hymns, about ?? [], favourites, lines);
  }, [hymns, grouped, byTopic, shelves, favourites, lines, about]);
  const hymnHeight = heightOf('hymn', fontScale);
  const foundHeight = heightOf('found', fontScale);
  const topicHeight = heightOf('topic', fontScale);
  const header = pullDown?.height ?? 0;
  const topics = useMemo(
    () => ({
      names: sticky.flatMap((i) => rows.slice(i, i + 1).flatMap((row) => names(row))),
      starts: topicStarts(
        rows,
        header,
        (kind) => ({ topic: topicHeight, shelf: topicHeight, hymn: hymnHeight })[kind],
      ),
    }),
    [rows, sticky, header, topicHeight, hymnHeight],
  );
  const own = useSharedValue(0);
  const uncovered = useSharedValue(0);
  const scroll = pullDown?.scroll ?? own;
  const cover = pullDown?.cover ?? uncovered;
  const rest = pullDown?.rest ?? 0;
  const sharedValues = useMemo(() => ({ scrollOffset: scroll }), [scroll]);
  const scroller = useAnimatedRef<Animated.ScrollView>();
  const railing = useSharedValue(false);
  const felt = useSharedValue(-1);
  const scrolling = useAnimatedProps(() => ({ scrollEnabled: !railing.value }));
  const end = listEndSpace(useStackBottom(), useFindRoom());
  const opening = useMemo(
    () =>
      Option.match(Option.fromNullishOr(start), {
        onNone: () => pullDown?.rest,
        onSome: (at) =>
          clampedStart(
            at,
            rows,
            header,
            (kind) => ({ topic: topicHeight, shelf: topicHeight, hymn: hymnHeight })[kind],
            end,
            viewport,
            rest,
          ),
      }),
    [start, pullDown?.rest, rows, header, topicHeight, hymnHeight, end, viewport, rest],
  );
  const following = Predicate.isNotUndefined(pullDown);
  const placed = useMemo(() => {
    if (!byTopic && !following) return [];
    return marksOf(
      rows,
      header,
      (kind) => ({ topic: topicHeight, shelf: topicHeight, hymn: hymnHeight })[kind],
    );
  }, [rows, byTopic, following, header, topicHeight, hymnHeight]);
  const marks = useMemo(() => {
    if (!byTopic) return [];
    return placed;
  }, [byTopic, placed]);
  const gutter = GUTTER * Math.min(1, marks.length);
  const look = useMemo(
    (): Look => ({
      accent,
      hymnHeight,
      foundHeight,
      topicHeight,
      gutter,
      hrefOf,
      onGroup: Option.fromNullishOr(onGroup),
      opening: Option.fromNullishOr(rowOpening),
    }),
    [accent, hymnHeight, foundHeight, topicHeight, gutter, hrefOf, onGroup, rowOpening],
  );
  const dialled = useAtomValue(find);
  const wanted = useSharedValue(-1);
  useEffect(() => {
    if (!following) {
      wanted.value = -1;
      return;
    }
    wanted.value = Find.$match(dialled, {
      Closed: () => -1,
      Open: ({ number }) => Option.getOrElse(foundOffset(placed, number), () => -1),
    });
  }, [wanted, following, dialled, placed]);
  useAnimatedReaction(
    () => wanted.value,
    (now, before) => {
      if (now >= 0 && now !== before) scrollTo(scroller, 0, Math.max(0, now - cover.value), false);
    },
  );
  const railTop = header - rest;
  const railBottom = end;
  const rail = useRail({
    marks,
    scroll,
    rest,
    quiet: railing,
    felt,
    onMark: (mark) => {
      'worklet';
      scrollTo(scroller, 0, Math.max(0, mark.offset - cover.value), false);
    },
  });
  const anchoring = useMemo(
    () => ({ data: true, shouldRestorePosition: () => scroll.value > rest + 1 }),
    [scroll, rest],
  );
  return (
    <GestureHandlerRootView style={styles.fill}>
      <View style={styles.fill}>
        <AnimatedLegendList
          refScrollView={scroller}
          animatedProps={scrolling}
          data={rows}
          keyExtractor={(row) => row.key}
          getItemType={drawnAs}
          getFixedItemSize={(_, __, drawn) => {
            if (drawn === 'hymn') return hymnHeight;
            if (drawn === 'found') return foundHeight;
            return topicHeight;
          }}
          estimatedItemSize={hymnHeight}
          recycleItems
          ListHeaderComponent={pullDown?.node}
          estimatedHeaderSize={pullDown?.height}
          ListFooterComponent={<ListEnd />}
          initialScrollOffset={opening}
          snapToOffsets={pullDown && [0, pullDown.rest]}
          snapToEnd={false}
          maintainVisibleContentPosition={anchoring}
          sharedValues={sharedValues}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          {...dismissal}
          onScrollBeginDrag={pullDown?.onTouch}
          ListEmptyComponent={<Text style={styles.empty}>{empty}</Text>}
          extraData={look}
          renderItem={drawRow}
        />
        {topics.names.length > 0 && (
          <PinnedTopic
            names={topics.names}
            starts={topics.starts}
            height={topicHeight}
            scroll={scroll}
            cover={cover}
            onPress={look.onGroup}
            quiet={railing}
            felt={felt}
            gutter={gutter}
          />
        )}
        {marks.length > 0 && (
          <Rail
            hold={rail}
            marks={marks}
            sections={topics.names}
            top={railTop}
            bottom={railBottom}
          />
        )}
      </View>
    </GestureHandlerRootView>
  );
}

const names = (row: Row<HymnText>): ReadonlyArray<string> => {
  if (row.kind === 'topic') return [row.name];
  return [];
};

function PinnedTopic({
  names: topics,
  starts,
  height,
  scroll,
  cover,
  onPress,
  quiet,
  felt,
  gutter,
}: {
  readonly names: ReadonlyArray<string>;
  readonly starts: ReadonlyArray<number>;
  readonly height: number;
  readonly scroll: SharedValue<number>;
  readonly cover: SharedValue<number>;
  readonly onPress: Option.Option<() => void>;
  readonly quiet: SharedValue<boolean>;
  readonly felt: SharedValue<number>;
  readonly gutter: number;
}) {
  const pinned = useDerivedValue(() => pinnedAt(starts, scroll.value, height, cover.value));
  const line = useAnimatedStyle(() => ({ transform: [{ translateY: cover.value }] }));
  const cue = useCue();
  const section = (place: number) => cue({ _tag: 'section', place });
  useAnimatedReaction(
    () => pinned.value.index,
    (now, before) => {
      const was = felt.value;
      felt.value = now;
      // oxlint-disable-next-line effect/noNullish -- Reanimated gives a reaction's first call its previous value as null.
      if (before !== null && now !== before && now >= 0 && now !== was && !quiet.value)
        scheduleOnRN(section, now);
    },
  );
  const [shown, setShown] = useState(false);
  useAnimatedReaction(
    () => pinned.value.index >= 0,
    (now, before) => {
      if (now !== before) scheduleOnRN(setShown, now);
    },
  );
  const place = useAnimatedStyle(() => ({
    opacity: Math.min(1, pinned.value.index + 1),
    transform: [{ translateY: pinned.value.y }],
  }));
  const strip = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, pinned.value.index) * height }],
  }));
  return (
    <Animated.View
      pointerEvents={Option.match(
        Option.filter(onPress, () => shown),
        {
          onNone: () => 'none',
          onSome: () => 'box-none',
        },
      )}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.pin, { height, right: gutter }, line]}
    >
      <Animated.View style={[{ height }, styles.clip, place]}>
        <Animated.View style={strip}>
          {topics.map((name, i) => (
            <Topic key={i} name={name} height={height} gutter={0} />
          ))}
        </Animated.View>
        {Option.getOrNull(
          Option.map(onPress, (press) => (
            <Pressable style={StyleSheet.absoluteFill} onPress={press} />
          )),
        )}
      </Animated.View>
    </Animated.View>
  );
}

function Topic({
  name,
  height,
  gutter,
}: {
  readonly name: string;
  readonly height: number;
  readonly gutter: number;
}) {
  return (
    <View
      accessible
      role="heading"
      aria-label={name}
      style={[styles.topic, { height, marginRight: gutter }]}
    >
      <Text style={styles.topicName} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

function GroupHeader({
  name,
  height,
  gutter,
  onPress,
}: {
  readonly name: string;
  readonly height: number;
  readonly gutter: number;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      style={{ marginRight: gutter }}
      role="heading"
      aria-label={name}
      accessibilityHint="Shows every group at once"
      onPress={onPress}
    >
      {({ pressed }) => (
        <View style={[styles.topic, { height }, pressed && styles.pressed]}>
          <Text style={styles.topicName} numberOfLines={1}>
            {name}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function ShelfHeader({
  name,
  href,
  height,
  gutter,
  accent,
}: {
  readonly name: string;
  readonly href: string;
  readonly height: number;
  readonly gutter: number;
  readonly accent: ColorValue;
}) {
  const link = useLinkTo({ href });
  return (
    <Pressable
      {...link}
      style={{ marginRight: gutter }}
      role="button"
      aria-label={`${name}, see all`}
    >
      {({ pressed }) => (
        <View style={[styles.topic, styles.shelf, { height }, pressed && styles.pressed]}>
          <Text style={styles.topicName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.seeAll, { color: accent }]} numberOfLines={1}>
            See all ›
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function HymnRow({
  hymn,
  href,
  source,
  favourite,
  line: found,
  height,
  gutter,
  accent,
  opening,
}: {
  readonly hymn: HymnText;
  readonly href: Href;
  readonly source: ReadonlyArray<number>;
  readonly favourite: boolean;
  readonly line: Option.Option<string>;
  readonly height: number;
  readonly gutter: number;
  readonly accent: ColorValue;
  readonly opening: Option.Option<RowOpening>;
}) {
  const how = Option.match(opening, {
    onNone: (): Opening => 'push',
    onSome: (asked) => asked.of(hymn.number),
  });
  const link = useLinkTo({ href: Link.resolveHref(href), replace: how === 'replace' });
  const pageFrom = useAtomSet(pagesFrom);
  const onPress: typeof link.onPress = (event) => {
    if (how === 'stay') event?.preventDefault();
    else {
      pageFrom(Option.some(source));
      link.onPress(event);
    }
    Option.map(opening, (asked) => asked.opened(how));
  };
  return (
    <Pressable
      {...link}
      onPress={onPress}
      style={{ marginRight: gutter }}
      aria-label={nameOf(hymn, favourite, found)}
    >
      {({ pressed }) => (
        <View style={[styles.row, { height }, pressed && styles.pressed]}>
          <Text
            testID="row-number"
            style={[
              styles.number,
              Option.isSome(found) && styles.numberOverLine,
              { color: accent },
            ]}
            numberOfLines={1}
          >
            {hymn.number}
          </Text>
          <View style={styles.words}>
            <View style={styles.titleLine}>
              <Text testID="row-title" style={styles.title} numberOfLines={1}>
                {hymn.title}
              </Text>
              {favourite && (
                <Text testID="row-star" style={[styles.star, { color: accent }]}>
                  ★
                </Text>
              )}
            </View>
            {Option.toArray(found).map((text) => (
              <Text key="line" testID="row-line" style={styles.found} numberOfLines={1}>
                {text}
              </Text>
            ))}
          </View>
          <View style={styles.separator} />
        </View>
      )}
    </Pressable>
  );
}

const nameOf = (hymn: HymnText, favourite: boolean, found: Option.Option<string>) =>
  [
    `${hymn.number}, ${hymn.title}`,
    ...['favourite'].filter(() => favourite),
    ...Option.toArray(found),
  ].join(', ');

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pin: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  clip: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    backgroundColor: color.ground,
  },
  pressed: { backgroundColor: color.soft },
  number: {
    minWidth: 36,
    fontSize: 17,
    lineHeight: line,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  numberOverLine: { alignSelf: 'flex-start', paddingTop: foundPadding },
  words: { flex: 1 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontSize: 17, lineHeight: line, color: color.ink },
  found: { fontSize: 15, lineHeight: foundLine, color: color.muted },
  star: { fontSize: 17, lineHeight: line },
  topic: {
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: color.ground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  topicName: { fontSize: 15, lineHeight: topicLine, fontWeight: '600', color: color.muted },
  shelf: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seeAll: { fontSize: 15, lineHeight: topicLine },
  empty: { padding: 16, fontSize: 17, color: color.muted },
  separator: {
    position: 'absolute',
    left: 64,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.line,
  },
});
