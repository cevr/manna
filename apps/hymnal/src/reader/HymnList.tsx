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

import type { HymnText } from '~/hymns/hymns';
import { color, useAccent } from '~/color';

import { dismissal } from './keyboard';
import type { Shelf } from './lists';
import { scrolled, told } from './scrolled';

const line = 22;
const padding = 11;

const rowHeight = (fontScale: number) => Math.ceil(line * fontScale) + 2 * padding;

export interface HymnListProps {
  readonly hymns: ReadonlyArray<HymnText>;
  readonly hrefOf: (number: number) => Href;
  readonly offset: Atom.Writable<number>;
  readonly empty?: string;
  readonly byTopic?: boolean;
  readonly shelves?: ReadonlyArray<Shelf<HymnText>>;
  readonly favourites?: ReadonlySet<number>;
  readonly pullDown?: PullDown;
  readonly lines?: ReadonlyMap<number, string>;
}

export interface PullDown {
  readonly node: ReactElement;
  readonly height: number;
  readonly rest: number;
  readonly scroll: SharedValue<number>;
  readonly cover?: SharedValue<number>;
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
