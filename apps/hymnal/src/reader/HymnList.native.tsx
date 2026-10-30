/**
 * A phone's list of hymns (LegendList), each row its number and title, a
 * link to the hymn at `hrefOf(number)`, or saying `empty` when it has none.
 *
 * With `byTopic`, a row names each run of hymns in one topic (`rowsOf`), and
 * a copy of it stays pinned at the list's top while that run's hymns scroll
 * under it (`PinnedTopic`). Above the topics, each of the reader's lists
 * that holds a hymn (`shelves`: Recent) is a run of its own under a header
 * naming it, a button that opens the list's own screen (`See all`); it is
 * not pinned, so it scrolls away with its hymns. A row of one of the reader's
 * `favourites` carries a star at its end, after its title, in every run, and
 * VoiceOver reads it as a favourite. The pin follows the scroll offset on the UI
 * thread from the topics' fixed places (`pin.ts`), not the list's sticky
 * headers: those wait on the JS thread at each handoff, and a fast drag
 * showed the row missing or out of place for a frame.
 * With a home tab's `grouped` hymns in place of `byTopic`, a pinned row
 * names each group of the tab and its hymns follow, a hymn in several groups
 * in each (`groupRowsOf`); the list opens at `start` when given (the tab's
 * kept place), no further than its end allows (`clampedStart`), else at
 * `pullDown`'s rest. With `onGroup`, a tap on a group's row, in the list or pinned, calls it (the tab's `All at once`).
 * A search's results given the hymns `about` its query show them under the
 * strongest matches, in a section `Hymns about this`, then the rest of the
 * matches under `More matches` (`resultRowsOf`); a section's row is a
 * topic's row, unpinned (a search's results pin none).
 * After its last row the list keeps `ListEnd`, the end space over the bottom
 * inset it meets, so the row ends clear of the home indicator, or of the
 * bar docked under the stack while it shows.
 * Each kind of row has one height, scaled with the reader's text size: a
 * hymn and a topic one line, a search result found by a line two (its title,
 * then that line). So the list knows each row's size before it draws it
 * (`getFixedItemSize`) and reuses a row's view for the next row of its kind
 * (`recycleItems`, `getItemType`).
 *
 * A phone never mounts the list anew under a pushed hymn or a sheet, so it
 * keeps its own place, and `offset` is the web's alone. Rows added above
 * (a hymn joining Recent) keep the rows in view where they were, unless the
 * list is at its top.
 *
 * A home list (`pullDown`) follows the find drums: while they are open on a
 * number, it scrolls to that hymn's first row under its topic (`foundOffset`),
 * and stays where it is when the list holds no such row.
 *
 * The Sections list has a number rail in a gutter at its right edge
 * (`Rail.tsx`). Every row, and the pinned topic, ends before the gutter
 * (`Look.gutter`), so no row's control lies under the rail's touch.
 */

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

/** A hymn row's line of text, and the space above and below it, at the reader's usual text size. */
const line = 22;
const padding = 11;

/** A topic row's line of text, and the space above and below it. */
const topicLine = 20;
const topicPadding = 8;

/** A found line's line of text under a result's title, and the space above and below the two. */
const foundLine = 18;
const foundPadding = 8;

/** What draws a row, and so its height: a found result has its line under its title. */
type Drawn = Row<HymnText>['kind'] | 'found';

const drawnAs = (row: Row<HymnText>): Drawn => {
  if (row.kind === 'hymn' && Option.isSome(row.line)) return 'found';
  return row.kind;
};

/** A row's height at the reader's text size (`fontScale`), as its text scales: a shelf's header is a topic's height. */
const heightOf = (drawn: Drawn, fontScale: number) => {
  if (drawn === 'hymn') return Math.ceil(line * fontScale) + 2 * padding;
  if (drawn === 'found')
    return Math.ceil(line * fontScale) + Math.ceil(foundLine * fontScale) + 2 * foundPadding;
  return Math.ceil(topicLine * fontScale) + 2 * topicPadding;
};

/**
 * What a row reads from outside its item. The list draws a row again only
 * when its item or this changes, so a row reads nothing else: `drawRow`
 * sits outside the component and sees its item and this alone.
 */
interface Look {
  readonly accent: ColorValue;
  readonly hymnHeight: number;
  readonly foundHeight: number;
  readonly topicHeight: number;
  /** The room at the right edge every row ends before: the rail's gutter, or 0 with no rail. */
  readonly gutter: number;
  readonly hrefOf: HymnListProps['hrefOf'];
  readonly onGroup: Option.Option<() => void>;
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
    />
  );
};

/** A home tab's groups (`home/tabs.ts`), each a name and its hymns' numbers. */
export interface Grouped {
  readonly name: string;
  readonly groups: ReadonlyArray<{ readonly name: string; readonly hymns: ReadonlyArray<number> }>;
}

/**
 * The offset that puts the row of `grouped`'s group named `name` at the top
 * of its list under a `top`-tall header, its rows drawn at `fontScale`
 * (`topicStart`). None when the group has no row.
 */
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

/**
 * The offset that puts each group's row at the top of a home tab's list
 * under a `top`-tall header, in the groups' order: `grouped`'s rows
 * (`groupRowsOf`), or with none Sections' (`rowsOf`, under `shelves`).
 */
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
}: HymnListProps & {
  /** A search's hymns about its query, nearest first: a section under its strongest matches (`resultRowsOf`). */
  readonly about?: ReadonlyArray<HymnText>;
  /** A home tab's groups in place of `byTopic`'s topics: each under its pinned row (`groupRowsOf`). */
  readonly grouped?: Grouped;
  /** The offset the list opens at, when not at `pullDown`'s rest (a tab's kept place). */
  readonly start?: number;
  /** A tap on a group's row, in the list or pinned: a home tab's `All at once`. */
  readonly onGroup?: () => void;
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
  // The list's scroll view, for the rail to scroll from the UI thread.
  const scroller = useAnimatedRef<Animated.ScrollView>();
  // While the rail is held its ticks are the topics felt, so the pin gives no
  // `section` cue of its own.
  const railing = useSharedValue(false);
  // The topic last felt, by its place, by the rail or the pin: a topic is felt once.
  const felt = useSharedValue(-1);
  // The list's own scroll is off while the rail is held: a finger moving down
  // the gutter drives the rail alone, and only the rail scrolls the list.
  const scrolling = useAnimatedProps(() => ({ scrollEnabled: !railing.value }));
  // The end the list keeps, clear of the bar or the `#`, as its last row (`ListEnd`) keeps it.
  const end = listEndSpace(useStackBottom(), useFindRoom());
  // A late topic asked for opens with the list's end at the screen's bottom, not past it.
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
  // Each hymn under a topic, at the offset that shows its row under the pin:
  // the rail's marks, and the rows a home list follows the find drums to.
  const following = Predicate.isNotUndefined(pullDown);
  const placed = useMemo(() => {
    if (!byTopic && !following) return [];
    return marksOf(
      rows,
      header,
      (kind) => ({ topic: topicHeight, shelf: topicHeight, hymn: hymnHeight })[kind],
    );
  }, [rows, byTopic, following, header, topicHeight, hymnHeight]);
  // The Sections list alone has a rail.
  const marks = useMemo(() => {
    if (!byTopic) return [];
    return placed;
  }, [byTopic, placed]);
  // The rows give the rail its gutter only where a rail is drawn: GUTTER with marks, else 0.
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
    }),
    [accent, hymnHeight, foundHeight, topicHeight, gutter, hrefOf, onGroup],
  );
  const dialled = useAtomValue(find);
  // The offset of the dialled hymn's row while the drums are open on a home list, else -1.
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
  // When the rows change under a reader scrolled into the list (a hymn opened
  // from it joins Recent above), the rows in view keep their place. At the
  // list's top nothing holds, so a list that gains a hymn shows it.
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
          // The last row ends clear of the home indicator and the docked bar.
          ListFooterComponent={<ListEnd />}
          // The list opens with the search field tucked under the title, and a
          // drag let go between there and the top settles at one or the other;
          // past the field it scrolls freely.
          initialScrollOffset={opening}
          snapToOffsets={pullDown && [0, pullDown.rest]}
          snapToEnd={false}
          maintainVisibleContentPosition={anchoring}
          sharedValues={{ scrollOffset: scroll }}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          {...dismissal}
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

/**
 * The topic row pinned at the list's top: every topic's row stacked in a
 * strip one row tall, moved on the UI thread so the topic whose hymns pass
 * under the top shows, pushed up as the next topic's row meets it. Screen
 * readers read the list's own topic rows, so the copy is hidden from them.
 * With `onPress` a tap on the shown copy is a tap on its group's row; with
 * none, and while no topic is pinned, touches pass through it to the list. A topic taking the pin gives a
 * `section` cue with its place among the topics, unless `quiet` (the
 * rail is held, and its own ticks are the topics felt) or the topic is the
 * one last `felt` (the rail felt it, and the list lands there after the
 * last scroll, whenever that comes). Under a layer over the
 * list's top (`cover`), the strip's line is the layer's bottom, read in
 * the same frame as the offset, so the row sits flush under the layer as
 * it slides.
 */
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
  /** The room at the right edge the pin ends before, as the rows do. */
  readonly gutter: number;
}) {
  const pinned = useDerivedValue(() => pinnedAt(starts, scroll.value, height, cover.value));
  const line = useAnimatedStyle(() => ({ transform: [{ translateY: cover.value }] }));
  const cue = useCue();
  const section = (place: number) => cue({ _tag: 'section', place });
  // A topic taking the pin is felt; the first call, as the list mounts, is not, nor one while `quiet`
  // (the rail held), nor the topic last felt (the rail's, as the list lands after its last scroll).
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
            // A topic that comes back has the same name: its place is its key.
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

/**
 * A topic's row: its name, quiet, on the ground, so the rows under it pass
 * unseen while it is pinned. It ends `gutter` before the right edge.
 */
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

/**
 * A home tab's group row: a topic's row that a tap zooms out to every group
 * at once (`onPress`); VoiceOver reads it as a heading it can activate.
 */
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

/**
 * A shelf's header: its name as a topic's row shows it, and `See all ›`, a
 * button that opens the shelf's own screen with all its hymns.
 */
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

/**
 * One hymn's row: a link the router opens in the app. Its press first hands
 * the pager the hymns of the list it sits in (`source`, `rows.ts`), so a
 * swipe on the hymn moves through them. A favourite's row ends with a
 * star at the number's size, after its title, so a long title's ellipsis
 * comes before the star; its name ends `, favourite`. A search's result
 * found by another line shows that `line` under its title, quiet, one line
 * long, and VoiceOver reads it last.
 */
function HymnRow({
  hymn,
  href,
  source,
  favourite,
  line: found,
  height,
  gutter,
  accent,
}: {
  readonly hymn: HymnText;
  readonly href: Href;
  readonly source: ReadonlyArray<number>;
  readonly favourite: boolean;
  readonly line: Option.Option<string>;
  readonly height: number;
  /** The room at the right edge the row, its star and its separator end before. */
  readonly gutter: number;
  readonly accent: ColorValue;
}) {
  const link = useLinkTo({ href: Link.resolveHref(href) });
  const pageFrom = useAtomSet(pagesFrom);
  const onPress: typeof link.onPress = (event) => {
    pageFrom(Option.some(source));
    link.onPress(event);
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

/** A hymn row's name as VoiceOver reads it: its number and title, `favourite` when it is one, then the line a search found it by. */
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
