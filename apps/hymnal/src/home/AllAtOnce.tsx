/**
 * `All at once`: the home list zoomed out to one tile per group of the tab
 * in use (`tilesOf`), over the list. A tile shows its group's name, how many
 * hymns it holds, and a strip of where they lie from hymn 1 to 695; the
 * group that holds the hymn the player has is outlined in the accent. A tap
 * on a tile zooms back in with that group's row at the list's top
 * (`onPick`); `Done` zooms back in where the list was (`onClose`). The
 * tiles open with the group at the list's top (`at`) in their first row.
 * The zoom out grows the tiles in from a little larger, and the zoom in
 * fades them out a little larger again.
 */

import { useAtomValue } from '@effect/atom-react';
import { Match, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import { useMemo } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  type ColorValue,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { Keyframe } from 'react-native-reanimated';

import { color, useAccent } from '~/color';
import { usePlayer } from '~/player/context';
import { Player } from '~/player/player';
import { ListEnd } from '~/reader/ListEnd';

import { playingNumber } from './playing';
import { type Tab, type Tile, tilesOf } from './tabs';

/** Tiles in a row, and the space between and around them. */
const columns = 2;
const gap = 10;

/** A tile's name lines, its count's line, its strip, and the space inside it. */
const nameLine = 20;
const countLine = 18;
const stripHeight = 4;
const tilePadding = 12;

/** A tile's height at the reader's text size (`fontScale`): two lines of name, the count, the strip. */
const tileHeight = (fontScale: number) =>
  2 * Math.ceil(nameLine * fontScale) +
  Math.ceil(countLine * fontScale) +
  stripHeight +
  2 * tilePadding +
  8;

/** The bar over the tiles: its line and the space around it. */
const barLine = 22;
const barPadding = 11;

const zoomOut = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 1.06 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
}).duration(180);

const zoomIn = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  100: { opacity: 0, transform: [{ scale: 1.06 }] },
}).duration(140);

const idle = Atom.make<Player>(Player.Idle());

/**
 * The number of the hymn the player has, 0 while idle: it changes with the
 * hymn alone, so a playback tick draws nothing here (`playingNumber`).
 */
const usePlaying = (): number =>
  useAtomValue(
    playingNumber(
      Option.match(usePlayer(), { onNone: () => idle, onSome: (player) => player.state }),
    ),
  );

export function AllAtOnce({
  tab,
  at,
  onPick,
  onClose,
}: {
  readonly tab: Tab;
  /** The tile of the group at the list's top. */
  readonly at: number;
  readonly onPick: (index: number) => void;
  readonly onClose: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const accent = useAccent();
  const playing = usePlaying();
  const tiles = useMemo(
    () =>
      tilesOf(
        tab,
        Option.liftPredicate(playing, (number) => number > 0),
      ),
    [tab, playing],
  );
  const height = tileHeight(fontScale);
  const firstRow = Math.floor(at / columns) * (height + gap);
  return (
    <Animated.View
      entering={zoomOut}
      exiting={zoomIn}
      accessibilityViewIsModal
      style={styles.screen}
    >
      <View style={styles.bar}>
        <Text role="heading" aria-level={2} style={styles.heading} numberOfLines={1}>
          {tab.name}, all at once
        </Text>
        <Pressable
          role="button"
          aria-label="Done"
          hitSlop={8}
          onPress={onClose}
          style={({ pressed }) => [styles.done, pressed && styles.pressed]}
        >
          <Text style={[styles.doneWords, { color: accent }]}>Done</Text>
        </Pressable>
      </View>
      <FlatList
        data={tiles}
        keyExtractor={(tile) => String(tile.index)}
        numColumns={columns}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.tiles}
        contentOffset={{ x: 0, y: firstRow }}
        ListEmptyComponent={<Text style={styles.empty}>No hymns here yet.</Text>}
        ListFooterComponent={<ListEnd />}
        renderItem={({ item }) => (
          <TileView
            tile={item}
            height={height}
            accent={accent}
            onPress={() => onPick(item.index)}
          />
        )}
      />
    </Animated.View>
  );
}

/** One group's tile: its name, its count, its strip; outlined when it holds the playing hymn. */
function TileView({
  tile,
  height,
  accent,
  onPress,
}: {
  readonly tile: Tile;
  readonly height: number;
  readonly accent: ColorValue;
  readonly onPress: () => void;
}) {
  const count = Match.value(tile.count).pipe(
    Match.when(1, () => '1 hymn'),
    Match.orElse((n) => `${n} hymns`),
  );
  return (
    <Pressable
      role="button"
      aria-label={[tile.name, count, tile.playing && 'playing'].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { height },
        tile.playing && { borderColor: accent },
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.name} numberOfLines={2}>
        {tile.name}
      </Text>
      <Text style={styles.count} numberOfLines={1}>
        {count}
      </Text>
      <View style={styles.strip} aria-hidden>
        {tile.spans.map((span) => (
          <View
            key={span.start}
            style={[
              styles.span,
              {
                left: `${span.start * 100}%`,
                width: `${(span.end - span.start) * 100}%`,
                backgroundColor: accent,
              },
            ]}
          />
        ))}
      </View>
    </Pressable>
  );
}

/** The grid button's mark: four squares, in the accent. */
export function GridMark() {
  const accent = useAccent();
  return (
    <View style={styles.mark} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.square, { borderColor: accent }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, zIndex: 1, backgroundColor: color.ground },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: barPadding,
  },
  heading: { flex: 1, fontSize: 17, lineHeight: barLine, fontWeight: '600', color: color.ink },
  done: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 8 },
  doneWords: { fontSize: 17, lineHeight: barLine, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  tiles: { paddingHorizontal: 16, gap },
  row: { gap },
  tile: {
    flex: 1 / columns,
    flexGrow: 1,
    justifyContent: 'space-between',
    padding: tilePadding,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: color.soft,
  },
  name: { fontSize: 15, lineHeight: nameLine, fontWeight: '600', color: color.ink },
  count: { fontSize: 13, lineHeight: countLine, color: color.muted },
  strip: {
    height: stripHeight,
    borderRadius: stripHeight / 2,
    overflow: 'hidden',
    backgroundColor: color.line,
  },
  span: { position: 'absolute', top: 0, bottom: 0 },
  empty: { padding: 16, fontSize: 15, color: color.muted },
  mark: { width: 20, height: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  square: { width: 9, height: 9, borderRadius: 2, borderWidth: 1.5 },
});
