/**
 * The bar's key button, at its left end, for the page's hymn. With chords
 * on it shows the guitar's head and the key: a small "KEY" over the
 * sounding key, or "CAPO n" over the key the chords are played in. A tap
 * opens the key and capo dials above the bar, and closes them; a hold
 * (450 ms) turns chords on or off, and no tap follows it. With chords off
 * it is the guitar's head alone, dim, and a tap opens the key dial alone.
 * VoiceOver turns chords on or off by the button's action.
 */

import type * as Chord from '@bible/hymnal/chord';
import { Match, Option } from 'effect';
import { type AccessibilityActionEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { color, useAccent } from '~/color';
import { GuitarHead } from '~/reader/GuitarHead';

import type { BoundThumb } from './Dials';
import { type Face, faceOf, saidOf, ThumbEvent } from './thumb';

/** How long a press is held before it turns chords on or off. */
export const HOLD = 450;

export function KeyButton({ thumb }: { readonly thumb: BoundThumb }) {
  const { printed, state, send } = thumb;
  const accent = useAccent();
  const face = Option.map(printed, (key: Chord.Key) => faceOf(key, state));
  const said = Option.match(printed, {
    onNone: () => (state.chords && 'No chords') || 'Chords off',
    onSome: (key) => saidOf(key, state),
  });
  const act = ({ nativeEvent }: AccessibilityActionEvent) => {
    if (nativeEvent.actionName === 'chords') send(ThumbEvent.Hold());
  };
  return (
    <Pressable
      role="button"
      aria-label="Key"
      aria-valuetext={said}
      aria-expanded={state.open}
      accessibilityActions={[
        { name: 'chords', label: (state.chords && 'Turn chords off') || 'Turn chords on' },
      ]}
      onAccessibilityAction={act}
      onPress={() => send(ThumbEvent.Tap())}
      onLongPress={() => send(ThumbEvent.Hold())}
      delayLongPress={HOLD}
      testID="key-button"
      style={({ pressed }) => [
        styles.button,
        Match.value(state.chords).pipe(
          Match.when(true, () => [
            styles.lit,
            state.open && { borderWidth: 2, borderColor: accent },
          ]),
          Match.orElse(() => styles.off),
        ),
        pressed && styles.pressed,
      ]}
    >
      <View style={!state.chords && styles.dim}>
        <GuitarHead on={state.chords} />
      </View>
      {Option.match(face, {
        onNone: () => [],
        onSome: (shown) => <Words face={shown} />,
      })}
    </Pressable>
  );
}

/** The small word over the key; nothing with chords off. */
function Words({ face }: { readonly face: Face }) {
  if (face._tag === 'Off') return [];
  return (
    <View style={styles.words}>
      <Text style={styles.over}>{face.over}</Text>
      <Text style={styles.key}>{face.key}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 44,
    height: 44,
    borderRadius: 22,
    paddingLeft: 6,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  lit: { backgroundColor: color.soft },
  off: {
    paddingRight: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  dim: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  words: { alignItems: 'flex-start' },
  over: { fontSize: 9.5, lineHeight: 11, fontWeight: '600', letterSpacing: 0.8, color: color.ink },
  key: { fontSize: 15, lineHeight: 17, fontWeight: '700', color: color.ink },
});
