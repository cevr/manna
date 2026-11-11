/**
 * The find bar (`find-bar`), drawn by the player layer on every screen where
 * the bar's `#` stands (`findAt`), the home list and a hymn page alike, so
 * it shares the `#`'s place, the room the lists leave for it (`findRoom`)
 * and the drums' backdrop.
 *
 * Folded, it is a capsule at the bottom right with two ways to find:
 * `Search` and the `#`. The capsule is glass (`glass`: `soft` at 85 %, with
 * no hairline round it, over whatever scrolls under the bar), its marks and
 * typed words the ink (`onGlass`), its placeholder `onGlassMuted`, and one
 * chosen mark, a disk in `glassChosen`, lies behind the chosen control
 * (`chosenOf`), whose mark takes `onGlassChosen`: the `#` while the drums
 * are open, Search while search is open, and at rest none, the mark faded
 * out and the `#` in the glass's ink as Search is.
 * A press on `Search` opens search on the screen at the bar's `path`
 * (`searchOpen`, keyed by the path): the capsule grows leftward across the
 * screen into a focused search box, the chosen mark fades in behind the
 * box's magnifier at the leading end, the `#` keeps the capsule's trailing
 * end, and `Cancel` stands at the bar's right. The results show over the
 * screen (`StackBottom.tsx`). `Cancel` folds it back, and the mark fades
 * out. Between two chosen controls (the drums opened with search open) the
 * mark slides. With Reduce Motion on the growth is a cross-fade alone
 * and the mark jumps. While the keyboard is up the bar rides 8 points over
 * its top.
 * The whole bar glides between its two places (`glideOf`), over the bar on a
 * hymn page and docked on the home list, as a hymn opens or closes; over the
 * bar it rides the bar's own spring as the bar rises or falls; a hymn page put
 * in another's place moves it not at all. With Reduce Motion it is set in its
 * new place under a 150 ms fade.
 * While the drums are open only the `#` takes a touch (`inReach`): every
 * other view of the bar, the capsule's own background too, lets a touch
 * through to the backdrop beneath it, which closes the drums.
 */

import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import {
  type ComponentRef,
  type ReactNode,
  type RefCallback,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  type HostInstance,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { color, useAccent } from '~/color';
import { plain, useCue } from '~/feel/cue';
import { BAR_SPRING, FindAt, glideOf, HASH, HASH_GAP } from '~/player/bar';
import { MOST_SCALE } from '~/player/DialView';
import { useReduceMotion } from '~/player/motion';
import { modeAt, searchAt, searchOpen, searchQuery, type Searching } from '~/reader/place';

import {
  chosenOf,
  type Control,
  drawn,
  type HashLook,
  hashLookOf,
  inReach,
  rowOf,
  tiles,
  tilesAt,
} from './finding';
import { Magnifier } from './Magnifier';
import { searchLabel } from './Results';

/** A control while the drums are open: a touch passes through it to the backdrop beneath the bar, and assistive technology does not see it. */
const outOfReach = { pointerEvents: 'none', 'aria-hidden': true } as const;
/** The capsule while the drums are open: a touch on its own background passes through to the backdrop; its `#` still takes one. */
const passThrough = { pointerEvents: 'box-none' } as const;

/** The folded capsule's width: its two buttons side by side. */
const FOLDED = 2 * HASH;
/** The space between the open capsule and `Cancel`. */
const CANCEL_GAP = 12;
/** The capsule's growth and the chosen mark's slide: one spring, so the mark keeps pace with the end it rides to. */
const GROWTH = { duration: 300, dampingRatio: 1 } as const;
/** The whole bar's glide between its two places: a little longer than the growth, as it crosses more of the screen, and as calm. */
const GLIDE = { duration: 350, dampingRatio: 1 } as const;
/** The chosen mark's fade as it shows over a control or leaves one with none chosen. */
const MARK_FADE = { duration: 150 } as const;

/** Cancel's work, for the bar's `Cancel` and Android's Back: the query cleared, the keyboard lowered, search off. */
export const useCancelSearch = () => {
  const setQuery = useAtomSet(searchQuery);
  const setMode = useAtomSet(searchOpen);
  return () => {
    setQuery('');
    Keyboard.dismiss();
    setMode(Option.none());
  };
};

/** The keyboard's height over the window's bottom edge, in points, on the UI thread as it rises and falls. */
const useKeyboardHeight = () => {
  const height = useSharedValue(0);
  useEffect(() => {
    const [rises, falls] = Platform.select({
      ios: ['keyboardWillShow', 'keyboardWillHide'] as const,
      default: ['keyboardDidShow', 'keyboardDidHide'] as const,
    });
    const show = Keyboard.addListener(rises, (event) => {
      height.value = withTiming(event.endCoordinates.height, { duration: event.duration || 250 });
    });
    const hide = Keyboard.addListener(falls, (event) => {
      height.value = withTiming(0, { duration: event.duration || 250 });
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [height]);
  return height;
};

/** Moves VoiceOver's focus to the view `held` holds, on a phone. */
const focusOn = (held: RefObject<Option.Option<HostInstance>>) => {
  if (Platform.OS === 'web') return;
  Option.match(held.current, {
    onNone: () => {},
    onSome: (view) => AccessibilityInfo.sendAccessibilityEvent(view, 'focus'),
  });
};

/** A ref that keeps the view it is handed, while one is mounted. */
const useHeld = <Host extends HostInstance>() => {
  const held = useRef(Option.none<HostInstance>());
  const keep: RefCallback<Host> = useCallback((view) => {
    held.current = Option.fromNullishOr(view);
  }, []);
  return [held, keep] as const;
};

/**
 * The bar of the screen at `path`, its bottom `bottom` points over the
 * window's at its place `at` (`findAt`), with the drums (`drums`) over it
 * while they are open (`drumsOpen`). A new `bottom` is reached as `glideOf`
 * says from the place the bar stood at; a bar told no place is set there at
 * once. `hash` draws the `#` in the look the bar gives it (`HashLook`): alone
 * on its own disk in the tiles' row, else in the capsule, over the chosen
 * mark or beside it. The tiles of `All at once` belong to the home list
 * (`/`): on any other screen the bar reads them hidden.
 */
export function FindBar({
  path,
  at = FindAt.Nowhere(),
  bottom,
  drums,
  drumsOpen,
  hash,
}: {
  readonly path: string;
  readonly at?: FindAt;
  readonly bottom: number;
  readonly drums: ReactNode;
  readonly drumsOpen: boolean;
  readonly hash: (look: HashLook) => ReactNode;
}) {
  const [searching, setSearching] = useAtom(searchOpen);
  const shown = useAtomValue(tiles);
  const [query, setQuery] = useAtom(searchQuery);
  const row = rowOf(modeAt(searching, path), tilesAt(shown, path));
  const cancel = useCancelSearch();
  const cue = useCue();
  const accent = useAccent();
  const reduced = useReduceMotion();
  const [asked, setAsked] = useState(Option.none<Searching>());
  const focusBox =
    row === 'open' &&
    Option.exists(asked, (mine) => Option.exists(searching, (open) => open === mine));
  const [searchButton, keepSearchButton] = useHeld<ComponentRef<typeof View>>();
  const [box, keepBox] = useHeld<ComponentRef<typeof TextInput>>();
  const keyboard = useKeyboardHeight();
  const progress = useSharedValue(Number(row === 'open'));
  const fade = useSharedValue(1);
  const [width, setWidth] = useState(0);
  const [cancelWidth, setCancelWidth] = useState(0);
  const chosen = chosenOf(row, drumsOpen);
  const side = useSharedValue(Number(chosen === 'search'));
  const markSeen = useSharedValue(Number(chosen !== 'none'));
  const wasChosen = useRef(chosen);
  useEffect(() => {
    const before = wasChosen.current;
    if (before === chosen) return;
    wasChosen.current = chosen;
    const to = Number(chosen === 'search');
    const seen = Number(chosen !== 'none');
    if (reduced) {
      if (chosen !== 'none') side.value = to;
      markSeen.value = seen;
    } else if (chosen === 'none') markSeen.value = withTiming(0, MARK_FADE);
    else if (before === 'none') {
      side.value = to;
      markSeen.value = withTiming(1, MARK_FADE);
    } else side.value = withSpring(to, GROWTH);
  }, [chosen, reduced, side, markSeen]);
  const was = useRef(row);
  useEffect(() => {
    const before = was.current;
    was.current = row;
    if (before === row) return;
    const open = Number(row === 'open');
    fade.value = 0;
    if (reduced) {
      progress.value = open;
      fade.value = withTiming(1, { duration: 150 });
    } else {
      progress.value = withSpring(open, GROWTH);
      fade.value = withTiming(1, { duration: 120 });
    }
    if (focusBox) focusOn(box);
    if (row === 'open') setAsked(Option.none());
    if (before === 'open' && row === 'folded') focusOn(searchButton);
  }, [row, reduced, focusBox, progress, fade]);
  const stand = useSharedValue(bottom);
  const seen = useSharedValue(1);
  const stood = useRef({ at, bottom });
  useEffect(() => {
    const before = stood.current;
    stood.current = { at, bottom };
    if (before.bottom === bottom) return;
    const glide = glideOf(before.at, at);
    if (glide === 'none' || reduced) stand.value = bottom;
    else if (glide === 'glide') stand.value = withSpring(bottom, GLIDE);
    else stand.value = withSpring(bottom, BAR_SPRING);
    if (glide !== 'glide' || !reduced) return;
    seen.value = 0;
    seen.value = withTiming(1, { duration: 150 });
  }, [bottom, reduced, stand, seen]);
  const placed = useAnimatedStyle(() => {
    const lift = (keyboard.value > 0 && Math.max(0, keyboard.value + HASH_GAP - stand.value)) || 0;
    return { bottom: stand.value, opacity: seen.value, transform: [{ translateY: -lift }] };
  });
  const open = Math.max(FOLDED, width - cancelWidth - CANCEL_GAP);
  const grown = useAnimatedStyle(() => {
    if (width === 0) return {};
    return { width: FOLDED + (open - FOLDED) * progress.value };
  });
  const slid = useAnimatedStyle(() => {
    if (width === 0) return { opacity: markSeen.value, transform: [{ translateX: 0 }] };
    const across = FOLDED + (open - FOLDED) * progress.value - HASH;
    return { opacity: markSeen.value, transform: [{ translateX: -across * side.value }] };
  });
  const faded = useAnimatedStyle(() => ({ opacity: fade.value }));
  const searchInk = (chosen === 'search' && color.onGlassChosen) || color.onGlass;
  const reach = (control: Control) => !inReach(control, drumsOpen) && outOfReach;
  const startSearch = () => {
    cue(plain('tab'));
    const opened = searchAt(path, 'field');
    setAsked(opened);
    setQuery('');
    setSearching(opened);
  };
  const controls = drawn(row);
  return (
    <Animated.View testID="find" pointerEvents="box-none" style={[styles.find, placed]}>
      {drums}
      <View
        testID="find-bar"
        pointerEvents="box-none"
        style={styles.row}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {row === 'tiles' && hash(hashLookOf(row, chosen))}
        {row !== 'tiles' && (
          <Animated.View
            {...(drumsOpen && passThrough)}
            style={[styles.capsule, row === 'open' && width === 0 && styles.grow, grown]}
          >
            <Animated.View
              testID="find-chosen"
              aria-hidden
              pointerEvents="none"
              style={[styles.chosen, slid]}
            />
            {controls.includes('search') && (
              <Animated.View style={faded} {...reach('search')}>
                <Pressable
                  ref={keepSearchButton}
                  testID="find-search"
                  role="button"
                  aria-label="Search"
                  accessibilityHint="Opens search"
                  aria-expanded={false}
                  onPress={startSearch}
                  style={({ pressed }) => [styles.button, pressed && styles.pressed]}
                >
                  <Magnifier tint={searchInk} />
                </Pressable>
              </Animated.View>
            )}
            {controls.includes('box') && (
              <Animated.View style={[styles.box, faded]} {...reach('box')}>
                <View style={styles.slot}>
                  <Magnifier tint={searchInk} />
                </View>
                <TextInput
                  ref={keepBox}
                  autoFocus={focusBox}
                  testID="find-box"
                  role="searchbox"
                  aria-label={searchLabel}
                  placeholder={searchLabel}
                  placeholderTextColor={color.onGlassMuted}
                  value={query}
                  onChangeText={setQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                  maxFontSizeMultiplier={MOST_SCALE}
                  style={styles.input}
                />
              </Animated.View>
            )}
            {hash(hashLookOf(row, chosen))}
          </Animated.View>
        )}
        {controls.includes('cancel') && (
          <Animated.View
            style={faded}
            onLayout={(event) => setCancelWidth(event.nativeEvent.layout.width)}
            {...reach('cancel')}
          >
            <Pressable
              testID="find-cancel"
              role="button"
              aria-label="Cancel"
              onPress={cancel}
              hitSlop={8}
              style={styles.cancel}
            >
              <Text
                style={[styles.cancelWords, { color: accent }]}
                maxFontSizeMultiplier={MOST_SCALE}
              >
                Cancel
              </Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  find: { position: 'absolute', left: 16, right: 16, gap: HASH_GAP },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: CANCEL_GAP },
  capsule: {
    height: HASH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderRadius: HASH / 2,
    backgroundColor: color.glass,
    overflow: 'hidden',
  },
  grow: { flex: 1 },
  chosen: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: HASH,
    height: HASH,
    borderRadius: HASH / 2,
    backgroundColor: color.glassChosen,
  },
  button: { width: HASH, height: HASH, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  box: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  slot: { width: HASH, height: HASH, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, height: HASH, fontSize: 17, color: color.onGlass },
  cancel: { minHeight: HASH, justifyContent: 'center' },
  cancelWords: { fontSize: 17 },
});
