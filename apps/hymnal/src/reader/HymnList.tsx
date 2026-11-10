/**
 * A list of hymns, each row its number and title, a link to the hymn at
 * `hrefOf(number)` (in the same tab), or saying `empty` when it has none.
 *
 * The list keeps its scroll offset in `offset` as it unmounts, and a list
 * mounted anew (on the web, Back and a tab switch mount it again) opens at
 * that offset.
 * Every row is one line of one height, scaled with the reader's text size,
 * so the list knows where each row is before it draws it (`getItemLayout`):
 * it can open at any offset, down to the last row, at once, and never moves
 * after the reader takes over.
 */

import { RegistryContext } from '@effect/atom-react';
import { Option } from 'effect';
import type * as Atom from 'effect/reactivity/Atom';
import { type Href, Link, useLinkTo } from 'one';
import { type ReactElement, useContext, useLayoutEffect, useRef, useState } from 'react';
import {
  type ColorValue,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type { Opening } from '~/home/opening';
import type { HymnText } from '~/hymns/hymns';
import { color, useAccent } from '~/color';

import { dismissal } from './keyboard';
import type { Shelf } from './lists';
import { scrolled, told } from './scrolled';

/** A row's line of text, and the space above and below it, at the reader's usual text size. */
const line = 22;
const padding = 11;

/** A row's height at the reader's text size (`fontScale`): one line and its padding, 44 at 1. */
const rowHeight = (fontScale: number) => Math.ceil(line * fontScale) + 2 * padding;

export interface HymnListProps {
  readonly hymns: ReadonlyArray<HymnText>;
  readonly hrefOf: (number: number) => Href;
  readonly offset: Atom.Writable<number>;
  readonly empty?: string;
  /** Phones only: a row per topic over its hymns, pinned while they scroll. The web draws none. */
  readonly byTopic?: boolean;
  /** Phones only, with `byTopic`: the reader's own lists, each above the topics under its name. The web draws none. */
  readonly shelves?: ReadonlyArray<Shelf<HymnText>>;
  /** Phones only: the reader's favourites, each starred in its rows. The web draws no star in a row. */
  readonly favourites?: ReadonlySet<number>;
  /** Phones only: what the list holds above its rows, and where it rests (`PullDown`). */
  readonly pullDown?: PullDown;
  /** Phones only, a search's results: the line each hymn was found by, shown under its title. The web shows none. */
  readonly lines?: ReadonlyMap<number, string>;
  /** Phones only, a search's hymns about its query, nearest first: a section under its strongest matches (`resultRowsOf`). The web draws none. */
  readonly about?: ReadonlyArray<HymnText>;
  /** Phones only: how the rows open their hymns, a search's results on a hymn page replacing it (`RowOpening`). Rows push when not given; the web's rows always push. */
  readonly opening?: RowOpening;
}

/**
 * How a list's rows open their hymns, as its owner asks (a search on a hymn
 * page, `Search.tsx`): `of` a row's number gives its opening (`openingAt`),
 * and `opened` is told it after the press.
 */
export interface RowOpening {
  readonly of: (number: number) => Opening;
  readonly opened: (how: Opening) => void;
}

/**
 * The home list's top on a phone: `node`, `height` points tall, above the
 * rows; the list opens scrolled by `rest` (the search field tucked under the
 * title), settles at 0 or `rest` when let go between them, and writes its
 * scroll offset to `scroll` on the UI thread, which moves the title.
 */
export interface PullDown {
  readonly node: ReactElement;
  readonly height: number;
  readonly rest: number;
  readonly scroll: SharedValue<number>;
  /** How many points of a layer over the list's top (the search field shown again) cover it: the pinned topic row sits under them. */
  readonly cover?: SharedValue<number>;
  /** The reader's finger met the list: a drag on it begins. */
  readonly onTouch?: () => void;
}

export function HymnList({ hymns, hrefOf, offset, empty }: HymnListProps) {
  const accent = useAccent();
  const screen = useWindowDimensions();
  const height = rowHeight(screen.fontScale);
  const registry = useContext(RegistryContext);
  const list = useRef<Option.Option<FlatList<HymnText>>>(Option.none());
  const [opening, setOpening] = useState(() =>
    Option.liftPredicate(registry.get(offset), (y) => y > 0),
  );
  const scrolledThere = useRef(false);
  const landed = () => setOpening(Option.none());
  const first = Option.map(opening, (y) => Math.min(Math.floor(y / height), hymns.length - 1)).pipe(
    Option.filter((index) => index >= 0),
  );
  useLayoutEffect(() => {
    Option.map(list.current, (l) => {
      const now = () => Option.getOrElse(scrolled(l), () => 0);
      Option.match(opening, {
        onSome: (y) => {
          if (scrolledThere.current) return;
          scrolledThere.current = true;
          l.scrollToOffset({ offset: y, animated: false });
          if (now() === 0) landed();
        },
        onNone: () => {
          if (now() > 0) told(l);
        },
      });
    });
    return () => {
      Option.map(Option.flatMap(list.current, scrolled), (y) => registry.set(offset, y));
    };
  }, []);
  return (
    <FlatList
      ref={(node) => {
        list.current = Option.fromNullishOr(node);
      }}
      data={hymns}
      keyExtractor={(hymn) => String(hymn.number)}
      getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
      onScroll={() => Option.map(opening, landed)}
      initialScrollIndex={Option.getOrUndefined(first)}
      contentOffset={Option.getOrUndefined(Option.map(opening, (y) => ({ x: 0, y })))}
      initialNumToRender={Option.getOrUndefined(
        Option.map(opening, () => Math.max(10, Math.ceil(screen.height / height) + 1)),
      )}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      {...dismissal}
      ListEmptyComponent={<Text style={styles.empty}>{empty}</Text>}
      renderItem={({ item }) => (
        <Row hymn={item} href={hrefOf(item.number)} height={height} accent={accent} />
      )}
    />
  );
}

/**
 * One hymn's row: a link (an anchor on the web), so Enter, a Cmd-click and
 * "Open in New Tab" work as on any link. A plain press opens the hymn
 * through the router, inside the app (`useLinkTo`'s press keeps the browser
 * from loading the page anew).
 */
function Row({
  hymn,
  href,
  height,
  accent,
}: {
  readonly hymn: HymnText;
  readonly href: Href;
  readonly height: number;
  readonly accent: ColorValue;
}) {
  const link = useLinkTo({ href: Link.resolveHref(href) });
  return (
    <Pressable {...link} aria-label={`${hymn.number}, ${hymn.title}`}>
      {({ pressed }) => (
        <View style={[styles.row, { height }, pressed && styles.pressed]}>
          <Text style={[styles.number, { color: accent }]} numberOfLines={1}>
            {hymn.number}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {hymn.title}
          </Text>
          <View style={styles.separator} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
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
  title: { flex: 1, fontSize: 17, lineHeight: line, color: color.ink },
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
