/**
 * The home list's find bar (`find-bar`), drawn by the player layer where the
 * bar's `#` stands (`findAt`), so it shares the `#`'s place, the room the
 * lists leave for it (`findRoom`) and the drums' backdrop.
 *
 * Folded, it is a capsule at the bottom right with three ways to find:
 * `Search`, `All at once` and the `#`. A press on `Search` opens search
 * (`searchOpen`): the capsule grows leftward across the screen into a
 * focused search box, the `#` keeps the capsule's trailing end without its
 * own disk, `All at once` leaves, and `Cancel` stands at the bar's right.
 * `Cancel` folds it back. With Reduce Motion on the growth is a cross-fade
 * alone. While the keyboard is up the bar rides 8 points over its top.
 * While the drums are open only the `#` takes a touch (`inReach`): the rest
 * lies under the backdrop, which closes the drums.
 */

import { useAtom, useAtomSet } from '@effect/atom-react';
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
import { HASH, HASH_GAP } from '~/player/bar';
import { MOST_SCALE } from '~/player/DialView';
import { useReduceMotion } from '~/player/motion';
import { searchOpen, searchQuery } from '~/reader/place';

import { GridMark } from './AllAtOnce';
import { askTiles, type Control, drawn, inReach, rowOf, tiles } from './finding';
import { Magnifier } from './Magnifier';
import { searchLabel } from './Results';

/** A control under the drums' backdrop: untouchable, so a tap falls to the backdrop, and unseen by assistive technology. */
const outOfReach = { pointerEvents: 'none', 'aria-hidden': true } as const;

/** The folded capsule's width: its three buttons side by side. */
const FOLDED = 3 * HASH;
/** The space between the open capsule and `Cancel`. */
const CANCEL_GAP = 12;

/** Cancel's work, for the bar's `Cancel` and Android's Back: the query cleared, the keyboard lowered, search off. */
export const useCancelSearch = () => {
  const setQuery = useAtomSet(searchQuery);
  const setMode = useAtomSet(searchOpen);
  return () => {
    setQuery('');
    Keyboard.dismiss();
    setMode('off');
  };
};

/** The keyboard's height over the window's bottom edge, in points, on the UI thread as it rises and falls. */
const useKeyboardHeight = () => {
  const height = useSharedValue(0);
  useEffect(() => {
    // iOS tells the keyboard's move as it starts; Android only once it is done.
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
 * The bar, its bottom `bottom` points over the window's, with the drums
 * (`drums`) over it while they are open (`drumsOpen`). `hash` draws the `#`,
 * on its own disk or, inside the open bar, without one.
 */
export function FindBar({
  bottom,
  drums,
  drumsOpen,
  hash,
}: {
  readonly bottom: number;
  readonly drums: ReactNode;
  readonly drumsOpen: boolean;
  readonly hash: (disk: boolean) => ReactNode;
}) {
  const [mode, setMode] = useAtom(searchOpen);
  const [shown, setTiles] = useAtom(tiles);
  const [query, setQuery] = useAtom(searchQuery);
  const row = rowOf(mode, shown);
  const cancel = useCancelSearch();
  const cue = useCue();
  const accent = useAccent();
  const reduced = useReduceMotion();
  // Only a press on `Search` in this bar's life focuses the box; a bar drawn again over open search leaves the keyboard down.
  const [asked, setAsked] = useState(false);
  const [searchButton, keepSearchButton] = useHeld<ComponentRef<typeof View>>();
  const [box, keepBox] = useHeld<ComponentRef<typeof TextInput>>();
  const keyboard = useKeyboardHeight();
  const progress = useSharedValue(Number(row === 'open'));
  const fade = useSharedValue(1);
  const [width, setWidth] = useState(0);
  const [cancelWidth, setCancelWidth] = useState(0);
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
      progress.value = withSpring(open, { duration: 300, dampingRatio: 1 });
      fade.value = withTiming(1, { duration: 120 });
    }
    if (row === 'open' && asked) focusOn(box);
    if (before === 'open' && row === 'folded') focusOn(searchButton);
  }, [row, reduced, asked, progress, fade]);
  const lifted = useAnimatedStyle(() => {
    if (keyboard.value <= 0) return { transform: [{ translateY: 0 }] };
    return { transform: [{ translateY: -Math.max(0, keyboard.value + HASH_GAP - bottom) }] };
  });
  const open = Math.max(FOLDED, width - cancelWidth - CANCEL_GAP);
  // Unmeasured, the open capsule fills the row by flex (`styles.grow`).
  const grown = useAnimatedStyle(() => {
    if (width === 0) return {};
    return { width: FOLDED + (open - FOLDED) * progress.value };
  });
  const faded = useAnimatedStyle(() => ({ opacity: fade.value }));
  const reach = (control: Control) => !inReach(control, drumsOpen) && outOfReach;
  const startSearch = () => {
    cue(plain('tab'));
    setAsked(true);
    setMode('field');
  };
  const controls = drawn(row);
  return (
    <Animated.View testID="find" pointerEvents="box-none" style={[styles.find, { bottom }, lifted]}>
      {drums}
      <View
        testID="find-bar"
        pointerEvents="box-none"
        style={styles.row}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {row === 'tiles' && hash(true)}
        {row !== 'tiles' && (
          <Animated.View
            style={[styles.capsule, row === 'open' && width === 0 && styles.grow, grown]}
          >
            {controls.includes('search') && (
              <Animated.View style={faded} {...reach('search')}>
                <Pressable
                  ref={keepSearchButton}
                  role="button"
                  aria-label="Search"
                  accessibilityHint="Opens search"
                  aria-expanded={false}
                  onPress={startSearch}
                  style={({ pressed }) => [styles.button, pressed && styles.pressed]}
                >
                  <Magnifier />
                </Pressable>
              </Animated.View>
            )}
            {controls.includes('grid') && (
              <Animated.View style={faded} {...reach('grid')}>
                <Pressable
                  role="button"
                  aria-label="All at once"
                  onPress={() => setTiles(askTiles)}
                  style={({ pressed }) => [styles.button, pressed && styles.pressed]}
                >
                  <GridMark />
                </Pressable>
              </Animated.View>
            )}
            {controls.includes('box') && (
              <Animated.View style={[styles.box, faded]} {...reach('box')}>
                <Magnifier />
                <TextInput
                  ref={keepBox}
                  autoFocus={asked}
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
                  style={styles.input}
                />
              </Animated.View>
            )}
            {hash(row !== 'open')}
          </Animated.View>
        )}
        {controls.includes('cancel') && (
          <Animated.View
            style={faded}
            onLayout={(event) => setCancelWidth(event.nativeEvent.layout.width)}
            {...reach('cancel')}
          >
            <Pressable
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.edge,
    backgroundColor: color.bar,
    overflow: 'hidden',
  },
  grow: { flex: 1 },
  button: { width: HASH, height: HASH, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  box: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12 },
  input: { flex: 1, height: HASH, fontSize: 17, color: color.ink },
  cancel: { minHeight: HASH, justifyContent: 'center' },
  cancelWords: { fontSize: 17 },
});
