import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'one';
import passage from 'virtual:heartseed-passage';

import { choose, peek, press, sayItView } from '../src/app';
import type { Mark } from '../src/matcher';
import { sourceWords } from '../src/matcher/words';
import { GRADE_NAMES, GRADES, type Grade } from '../src/sayit';
import { screenOf, type Result } from '../src/sayit/screen';

/** Palette A (Wada No. 167) over the prototype's tokens. */
const color = {
  ground: '#eee8e1',
  card: '#f7f3ee',
  ink: '#064f6e',
  soft: '#a7d4e4',
  mute: '#7d8d95',
  miss: '#c0583f',
  hearing: 'rgba(184, 137, 47, 0.22)',
  pulse: 'rgba(184, 137, 47, 0.45)',
} as const;

const WORDS = sourceWords(passage.text);

/** A word lights with a short fade; under Reduce Motion it shows at once. */
const LIGHT = FadeIn.duration(180).reduceMotion(ReduceMotion.System);

/** One source word as the recital shows it: lit, being heard, unsaid, missed (a mark to peek at) or peeked. */
function Word({
  mark,
  word,
  onPeek,
}: {
  readonly mark: Mark;
  readonly word: string;
  readonly onPeek: (index: number) => void;
}) {
  const id = `word-${mark.index}`;
  switch (mark.status) {
    case 'matched':
      return (
        <Animated.Text testID={id} entering={LIGHT} style={[styles.word, styles.lit]}>
          {word}
        </Animated.Text>
      );
    case 'peek':
      return (
        <Text testID={id} aria-label={`${word}, peeked`} style={[styles.word, styles.peeked]}>
          {word}
        </Text>
      );
    case 'miss':
      return (
        <Pressable
          testID={id}
          role="button"
          aria-label={`Missed word ${mark.index + 1}`}
          hitSlop={10}
          onPress={() => onPeek(mark.index)}
          style={({ pressed }) => [styles.mark, pressed && styles.pressed]}
        >
          <View style={styles.dot} />
        </Pressable>
      );
    case 'tentative':
      return (
        <Text testID={id} aria-hidden style={[styles.word, styles.hearing]}>
          {word}
        </Text>
      );
    case 'pending':
      return (
        <View testID={id} aria-hidden style={styles.slot}>
          <Text style={[styles.word, styles.unsaid]}>{word}</Text>
        </View>
      );
  }
}

/** The verse whole, or one element per word while a recital is shown, each its own accessibility element. */
function Verse({
  marks,
  onPeek,
}: {
  readonly marks: Option.Option<readonly Mark[]>;
  readonly onPeek: (index: number) => void;
}) {
  return Option.match(marks, {
    onNone: () => (
      <Text testID="passage" style={styles.words}>
        {passage.text}
      </Text>
    ),
    onSome: (shown) => (
      <View style={styles.verse}>
        {shown.map((mark) => (
          <Word key={mark.index} mark={mark} word={WORDS[mark.index] ?? ''} onPeek={onPeek} />
        ))}
      </View>
    ),
  });
}

/** The count, the suggestion and the four grades of a finished recital, the chosen one checked. */
function Grades({
  result,
  onChoose,
}: {
  readonly result: Result;
  readonly onChoose: (grade: Grade) => void;
}) {
  return (
    <View style={styles.result}>
      <Text testID="summary" style={styles.summary}>
        {result.summary}
      </Text>
      <Text style={styles.suggested}>{result.suggested}</Text>
      <View role="radiogroup" aria-label="Grade" style={styles.grades}>
        {GRADES.map((grade) => {
          const chosen = result.choice === grade;
          return (
            <Pressable
              key={grade}
              role="radio"
              aria-label={GRADE_NAMES[grade]}
              aria-checked={chosen}
              onPress={() => onChoose(grade)}
              style={({ pressed }) => [
                styles.grade,
                chosen && styles.chosen,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.gradeName, chosen && styles.chosenName]}>
                {GRADE_NAMES[grade]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The one button: large, round and ink, with a gentle pulse while it listens (held still under Reduce Motion). */
function SayItButton({
  label,
  listening,
  pressable,
  onPress,
}: {
  readonly label: string;
  readonly listening: boolean;
  readonly pressable: boolean;
  readonly onPress: () => void;
}) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = 0;
    if (!listening) return;
    pulse.value = withRepeat(
      withTiming(1, {
        duration: 1200,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      }),
      -1,
      false,
    );
  }, [listening, pulse]);
  const ring = useAnimatedStyle(() => ({
    opacity: 1 - pulse.value,
    transform: [{ scale: 1 + pulse.value * 0.4 }],
  }));
  return (
    <View style={styles.buttonPlace}>
      <Animated.View aria-hidden style={[styles.ring, ring]} />
      <Pressable
        role="button"
        aria-label={label}
        disabled={!pressable}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.pressedButton,
          !pressable && styles.disabled,
        ]}
      >
        <Text style={styles.buttonText}>{label}</Text>
      </Pressable>
    </View>
  );
}

/** Today: the passage the reader is learning, and Say it. */
export default function Today() {
  const insets = useSafeAreaInsets();
  const screen = screenOf(AsyncResult.value(useAtomValue(sayItView)));
  const onPress = useAtomSet(press);
  const onPeek = useAtomSet(peek);
  const onChoose = useAtomSet(choose);
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Text role="heading" aria-level={1} style={styles.title}>
        Today
      </Text>
      <View style={styles.passage}>
        <Text testID="reference" style={styles.reference}>
          {passage.reference}
        </Text>
        <Verse marks={screen.marks} onPeek={onPeek} />
      </View>
      {Option.match(screen.result, {
        onNone: () => false,
        onSome: (result) => <Grades result={result} onChoose={onChoose} />,
      })}
      {Option.match(screen.alert, {
        onNone: () => false,
        onSome: (alert) => (
          <Text role="alert" style={styles.alert}>
            {alert}
          </Text>
        ),
      })}
      <SayItButton
        label={screen.button}
        listening={screen.listening}
        pressable={screen.pressable}
        onPress={() => onPress()}
      />
    </ScrollView>
  );
}

const SERIF = 'Georgia';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: 24, gap: 28 },
  title: { fontSize: 34, fontWeight: '700', color: color.ink },
  passage: { gap: 10 },
  reference: { fontFamily: SERIF, fontSize: 17, fontWeight: '600', color: color.mute },
  words: { fontFamily: SERIF, fontSize: 24, lineHeight: 36, color: color.ink },
  verse: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 7, rowGap: 2 },
  word: { fontFamily: SERIF, fontSize: 24, lineHeight: 36 },
  lit: { color: color.ink },
  hearing: { color: color.mute, backgroundColor: color.hearing, borderRadius: 4 },
  slot: { height: 30, marginBottom: 6, borderBottomWidth: 2, borderBottomColor: color.soft },
  unsaid: { color: 'transparent', lineHeight: 30 },
  peeked: { color: color.miss },
  mark: { width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.miss },
  result: { gap: 10, padding: 16, borderRadius: 20, backgroundColor: color.card },
  summary: { fontSize: 17, fontWeight: '600', color: color.ink },
  suggested: { fontSize: 15, color: color.mute },
  grades: { flexDirection: 'row', gap: 8, marginTop: 4 },
  grade: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.ground,
  },
  chosen: { backgroundColor: color.ink },
  gradeName: { fontSize: 15, fontWeight: '600', color: color.ink },
  chosenName: { color: color.ground },
  alert: { fontSize: 15, lineHeight: 21, color: color.miss },
  buttonPlace: { alignSelf: 'center', width: 132, height: 132, marginTop: 8 },
  ring: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: color.pulse,
  },
  button: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.ink,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  pressedButton: { transform: [{ scale: 0.97 }] },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.6 },
  buttonText: { color: color.ground, fontSize: 17, fontWeight: '600' },
});
