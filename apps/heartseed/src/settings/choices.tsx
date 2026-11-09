/**
 * The reader's choices of the session's minutes and the voice, each under
 * its line, as the Settings sheet shows them: the sheet is the one place
 * they show. The radio group `Minutes` (`MinutesChoice`) is shown once the
 * stored choice is read, so its first frame shows the value read, and the
 * voice's pill (`VoiceChoice`) once its choice is read, with the natural
 * voice's status line under it and its `Try again` after a failure. Each
 * control is at least 44 pt tall and filled in ink when on. A tap goes
 * through `chooseMinutes` or `cycleVoice`, so the choice shows at once and
 * is stored.
 */

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  chooseMinutes,
  cycleVoice,
  naturalView,
  retryNatural,
  sessionView,
  voiceView,
} from '../app';
import { themed, useThemed } from '../look';
import { lineOf } from '../natural/state';
import { useLook } from '../sayit/draw';
import { MINUTES } from '../session';

/** A Minutes radio: at least 44 pt tall, filled in ink when chosen. */
function Pill({
  label,
  on,
  onPress,
}: {
  readonly label: string;
  readonly on: boolean;
  readonly onPress: () => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <Pressable
      role="radio"
      aria-label={label}
      aria-checked={on}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, on && styles.chosen, pressed && look.pressed]}
    >
      <Text style={[styles.word, on && styles.chosenWord]}>{label}</Text>
    </Pressable>
  );
}

/** Each of the voice's choices as the Voice pill says it, in its text and as its accessibility value; a choice with no word here fails the typecheck at the pill. */
const CHOICE_WORDS = { off: 'Off', her: 'Her', him: 'Him' } as const;

/**
 * The voice's pill: a button labelled `Voice` whose value and text say the
 * choice (`Voice: Her`), filled in ink unless the choice is Off; a tap takes
 * the next choice of the cycle Off, Her, Him.
 */
function VoicePill({
  choice,
  onPress,
}: {
  readonly choice: keyof typeof CHOICE_WORDS;
  readonly onPress: () => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  const on = choice !== 'off';
  return (
    <Pressable
      role="button"
      aria-label="Voice"
      aria-valuetext={CHOICE_WORDS[choice]}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, on && styles.chosen, pressed && look.pressed]}
    >
      <Text style={[styles.word, on && styles.chosenWord]}>{`Voice: ${CHOICE_WORDS[choice]}`}</Text>
    </Pressable>
  );
}

/** A choice under its `line`, as the Settings sheet shows each. */
function Lined({ line, children }: { readonly line: string; readonly children: ReactNode }) {
  const styles = useThemed(sheets);
  return (
    <View style={styles.lined}>
      <Text style={styles.line}>{line}</Text>
      {children}
    </View>
  );
}

/** The radio group `Minutes` over the session's minutes, the chosen one checked, under `line`; nothing until the session's view is read. */
export function MinutesChoice({ line }: { readonly line: string }) {
  const styles = useThemed(sheets);
  const session = AsyncResult.value(useAtomValue(sessionView));
  const onMinutes = useAtomSet(chooseMinutes);
  return Option.match(session, {
    onNone: () => false,
    onSome: ({ minutes }) => (
      <Lined line={line}>
        <View role="radiogroup" aria-label="Minutes" style={styles.choices}>
          {MINUTES.map((each) => (
            <Pill
              key={each}
              label={`${each} min`}
              on={minutes === each}
              onPress={() => onMinutes(each)}
            />
          ))}
        </View>
      </Lined>
    ),
  });
}

/**
 * The natural voice's status line, under the Voice pill: the line `lineOf`
 * gives the natural voice's view (none while the voice is Off, ready, idle
 * or unsupported), and beside the words, never inside them, a `Try again`
 * button after a failed download or load. It stays while Say it listens, as
 * the pill does.
 */
function NaturalLine() {
  const look = useLook();
  const styles = useThemed(sheets);
  const line = Option.flatMap(AsyncResult.value(useAtomValue(naturalView)), lineOf);
  const onRetry = useAtomSet(retryNatural);
  return Option.match(line, {
    onNone: () => false,
    onSome: ({ text, retry }) => (
      <View style={styles.natural}>
        <Text testID="natural-status" style={styles.naturalText}>
          {text}
        </Text>
        {retry && (
          <Pressable
            role="button"
            aria-label="Try again"
            onPress={() => onRetry()}
            style={({ pressed }) => [styles.retry, pressed && look.pressed]}
          >
            <Text style={styles.word}>Try again</Text>
          </Pressable>
        )}
      </View>
    ),
  });
}

/** The voice's pill over the voice's choice, and under it the natural voice's status line, under `line`; nothing until the choice is read. */
export function VoiceChoice({ line }: { readonly line: string }) {
  const voice = AsyncResult.value(useAtomValue(voiceView));
  const onVoice = useAtomSet(cycleVoice);
  return Option.match(voice, {
    onNone: () => false,
    onSome: ({ choice }) => (
      <Lined line={line}>
        <VoicePill choice={choice} onPress={() => onVoice()} />
        <NaturalLine />
      </Lined>
    ),
  });
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    lined: { gap: 10, alignItems: 'flex-start' },
    line: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.ink },
    pill: {
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: color.card,
    },
    chosen: { backgroundColor: color.ink },
    word: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.ink },
    chosenWord: { color: color.onInk },
    natural: { gap: 8, alignItems: 'flex-start' },
    naturalText: { fontFamily: face, fontSize: 15, lineHeight: 21, color: color.ink },
    retry: {
      minHeight: 44,
      paddingHorizontal: 18,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: color.ink,
      justifyContent: 'center',
    },
  }),
);
