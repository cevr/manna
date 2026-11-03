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

const outOfReach = { pointerEvents: 'none', 'aria-hidden': true } as const;
const passThrough = { pointerEvents: 'box-none' } as const;

const FOLDED = 2 * HASH;
const CANCEL_GAP = 12;
const GROWTH = { duration: 300, dampingRatio: 1 } as const;
const GLIDE = { duration: 350, dampingRatio: 1 } as const;

export const useCancelSearch = () => {
  const setQuery = useAtomSet(searchQuery);
  const setMode = useAtomSet(searchOpen);
  return () => {
    setQuery('');
    Keyboard.dismiss();
    setMode(Option.none());
  };
};

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

const focusOn = (held: RefObject<Option.Option<HostInstance>>) => {
  if (Platform.OS === 'web') return;
  Option.match(held.current, {
    onNone: () => {},
    onSome: (view) => AccessibilityInfo.sendAccessibilityEvent(view, 'focus'),
  });
};

const useHeld = <Host extends HostInstance>() => {
  const held = useRef(Option.none<HostInstance>());
  const keep: RefCallback<Host> = useCallback((view) => {
    held.current = Option.fromNullishOr(view);
  }, []);
  return [held, keep] as const;
};

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
  const wasChosen = useRef(chosen);
  useEffect(() => {
    if (wasChosen.current === chosen) return;
    wasChosen.current = chosen;
    const to = Number(chosen === 'search');
    if (reduced) side.value = to;
    else side.value = withSpring(to, GROWTH);
  }, [chosen, reduced, side]);
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
    if (width === 0) return { transform: [{ translateX: 0 }] };
    const across = FOLDED + (open - FOLDED) * progress.value - HASH;
    return { transform: [{ translateX: -across * side.value }] };
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
        {row === 'tiles' && hash('alone')}
        {row !== 'tiles' && (
          <Animated.View
            {...(drumsOpen && passThrough)}
            style={[styles.capsule, row === 'open' && width === 0 && styles.grow, grown]}
          >
            {}
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
