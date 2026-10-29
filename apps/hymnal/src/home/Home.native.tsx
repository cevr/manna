/**
 * A phone's home screen: the title "Hymns" and a settings button over the
 * hymn list, with the search field pulled down from under the title, as
 * iOS's search controller hides its field.
 *
 * The list's content is a spacer the title's height, the field, then the
 * rows; the list opens scrolled by the field's height, so the field rests
 * under the title, which is a layer over the list on the ground. On the UI
 * thread the title follows the list's offset: it stays put while the list
 * is between its top and the field's height (a pull brings the field out
 * under it), moves up with the rows past that, and follows a pull past the
 * top down. The title's text takes no touch, so a drag that starts on it
 * scrolls the list.
 *
 * Deep in the list, an upward scroll brings the field back over the list's
 * top under the status bar, and a downward one sends it away (`reveal.ts`,
 * `ShownField`): a layer, so the list's content and offset never move for
 * it, with the pinned topic row under it (`PullDown.cover`). The title,
 * coming back down as the list nears its top, covers it.
 *
 * Tapping the field enters search mode: a bar with the focused text field
 * and Cancel, over the results. A topic or passage tapped in `About this
 * hymn` enters it too, with its query (`searchOpen`). The list stays mounted beneath, untouchable
 * and hidden from assistive technology, so it keeps its place. Cancel, or
 * Android's Back while the home screen is in focus (`searchBack`), clears
 * the query and shows the list as it was.
 */

import { useAtom } from '@effect/atom-react';
import { Link, useLinkTo, useNavigation, useSafeAreaInsets } from 'one';
import { Effect, Fiber, Option } from 'effect';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { hymnAt } from '~/hymns/hymns';
import { aboutQuery, aboutShown, afterPause, readMeaningSoon } from '~/hymns/meaning';
import { find, hymnIndex } from '~/hymns/search';
import { HymnList } from '~/reader/HymnList.native';
import { searchOffset, searchOpen, searchQuery } from '~/reader/place';
import { color, useAccent } from '~/color';

import { searchBack } from './back';
import { Browse } from './Browse';
import { Gear } from './Gear';
import { searchLabel } from './Results';
import { hidden, reachable, revealAt, shownHeight } from './reveal';

/**
 * A layer out of reach, untouchable and unseen by assistive technology: the
 * list beneath search mode (kept in place), and the shown field while it is
 * off screen.
 */
const outOfReach = {
  pointerEvents: 'none',
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/** The title row's line (a large title) and the space under it, at the reader's usual text size. */
const titleLine = 41;
const titleSpace = 8;

/** The field's line and the space around its text and around the field. */
const fieldLine = 22;
const fieldPadding = 7;
const fieldMargin = 8;

export function Home() {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const [searching, setSearching] = useAtom(searchOpen);
  const title = Math.ceil(titleLine * fontScale) + titleSpace;
  const field = Math.ceil(fieldLine * fontScale) + 2 * fieldPadding + 2 * fieldMargin;
  const scroll = useSharedValue(field);
  const cover = useShownHeight(scroll, field, field);
  const enter = () => setSearching(true);
  return (
    <View style={styles.screen}>
      <View style={[styles.below, { marginTop: insets.top }]}>
        <View style={styles.fill} {...(searching && outOfReach)}>
          <Browse
            pullDown={{
              node: (
                <View style={{ height: title + field }}>
                  <View style={{ height: title }} />
                  <FieldButton height={field} onPress={enter} />
                </View>
              ),
              height: title + field,
              rest: field,
              scroll,
              cover,
            }}
          />
          <ShownField
            height={field}
            cover={cover}
            scroll={scroll}
            rest={field}
            title={title}
            onPress={enter}
          />
          <Title height={title} rest={field} scroll={scroll} />
        </View>
        {searching && <Search onCancel={() => setSearching(false)} />}
      </View>
      {/* The status bar's ground: rows and the title pass under it unseen. */}
      <View style={[styles.scrim, { height: insets.top }]} />
    </View>
  );
}

/** The title and the settings button, moved with the list's offset. */
function Title({
  height,
  rest,
  scroll,
}: {
  readonly height: number;
  readonly rest: number;
  readonly scroll: SharedValue<number>;
}) {
  const settings = useLinkTo({ href: Link.resolveHref('/settings') });
  const moved = useAnimatedStyle(() => {
    'worklet';
    const y = scroll.value;
    if (y < 0) return { transform: [{ translateY: -y }] };
    if (y > rest) return { transform: [{ translateY: rest - y }] };
    return { transform: [{ translateY: 0 }] };
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

/** The field's slide in or out over the list's top: quick out of the way, as a toolbar's. */
const slide = { duration: 200, easing: Easing.out(Easing.cubic) };

/**
 * How many points of the search field show over the list's top, on the UI
 * thread from the list's offset: `revealAt` turns the field on each frame's
 * offset, a turn slides it in or out, and `shownHeight` keeps it at 0 at
 * and above the list's resting place `rest`.
 */
function useShownHeight(scroll: SharedValue<number>, rest: number, height: number) {
  const state = useSharedValue(hidden(rest));
  const progress = useSharedValue(0);
  useAnimatedReaction(
    () => scroll.value,
    (now) => {
      const next = revealAt(state.value, now, rest);
      if (next.shown !== state.value.shown) progress.value = withTiming(Number(next.shown), slide);
      state.value = next;
    },
  );
  return useDerivedValue(() => shownHeight(progress.value, height, scroll.value, rest));
}

/**
 * The search field shown again over the list's top, under the status bar,
 * once the reader scrolls up deep in the list (`useShownHeight`): a layer
 * on the ground, so the rows pass under it and the list's content and
 * offset never move for it. Its slide runs on the UI thread; React hears
 * only when its box comes out below the title (near the list's top the
 * title covers it) and when it goes, to let touches and VoiceOver reach it
 * only while some of the box shows (`reachable`).
 */
function ShownField({
  height,
  cover,
  scroll,
  rest,
  title,
  onPress,
}: {
  readonly height: number;
  readonly cover: SharedValue<number>;
  readonly scroll: SharedValue<number>;
  readonly rest: number;
  readonly title: number;
  readonly onPress: () => void;
}) {
  const [shown, setShown] = useState(false);
  useAnimatedReaction(
    () => reachable(cover.value, scroll.value, rest, title, fieldMargin),
    (now, before) => {
      if (now !== before) scheduleOnRN(setShown, now);
    },
  );
  const place = useAnimatedStyle(() => ({ transform: [{ translateY: cover.value - height }] }));
  return (
    <Animated.View {...(!shown && outOfReach)} style={[styles.shown, { height }, place]}>
      <FieldButton height={height} onPress={onPress} />
    </Animated.View>
  );
}

/** The search field as the list holds it: a button drawn as a field, which enters search mode. */
function FieldButton({
  height,
  onPress,
}: {
  readonly height: number;
  readonly onPress: () => void;
}) {
  return (
    <View style={[styles.fieldFrame, { height }]}>
      <Pressable
        role="button"
        aria-label={searchLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.field, pressed && styles.pressed]}
      >
        <Text style={styles.placeholder} numberOfLines={1}>
          {searchLabel}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Search mode: the focused field and Cancel over the hymns the query finds,
 * each found by a line other than its title showing that line. Search mode
 * builds the search's index (`hymnIndex`) once it is on screen, while the
 * keyboard comes up, and reads the meaning table in a task of its own after it
 * (`readMeaningSoon`), so neither the first keystroke nor the first pause
 * waits on them and no one task holds the thread for both; the app's start
 * never does. After a pause in the typing (`afterPause`), the hymns
 * about the query stand under its strongest matches.
 */
function Search({ onCancel }: { readonly onCancel: () => void }) {
  const [query, setQuery] = useAtom(searchQuery);
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
  const accent = useAccent();
  const cancel = () => {
    setQuery('');
    Keyboard.dismiss();
    onCancel();
  };
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
      <View style={styles.bar}>
        <TextInput
          autoFocus
          role="searchbox"
          aria-label={searchLabel}
          placeholder={searchLabel}
          placeholderTextColor={color.muted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={[styles.field, styles.input]}
        />
        <Pressable role="button" onPress={cancel} hitSlop={8} style={styles.cancel}>
          <Text style={[styles.cancelWords, { color: accent }]}>Cancel</Text>
        </Pressable>
      </View>
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
  shown: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: color.ground },
  fieldFrame: { paddingHorizontal: 16, paddingVertical: fieldMargin },
  field: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: fieldPadding,
    borderRadius: 10,
    backgroundColor: color.soft,
  },
  placeholder: { fontSize: 17, lineHeight: fieldLine, color: color.muted },
  search: { ...StyleSheet.absoluteFill, backgroundColor: color.ground },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: fieldMargin,
  },
  input: { fontSize: 17, lineHeight: fieldLine, color: color.ink },
  cancel: { minHeight: 44, justifyContent: 'center' },
  cancelWords: { fontSize: 17 },
});
