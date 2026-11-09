/**
 * The reader's choices of the session's minutes and the voice, as the
 * Settings sheet shows each under its line (Today's row, `Choices`, shows
 * them only under the rigs' `ChoicesOnToday`): the radio group `Minutes` (`MinutesChoice`),
 * shown once the stored choice is read so its first frame shows the value
 * read, and the voice's pill (`VoiceChoice`), shown once its choice is
 * read. Each control is at least 44 pt tall and
 * filled in ink when on. A tap goes through `chooseMinutes` or
 * `cycleVoice`, so the choice shows at once and is stored.
 */

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { createContext, use, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { chooseMinutes, cycleVoice, sessionView, voiceView } from '../app';
import { themed, useThemed } from '../look';
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

/** A choice under its `line` when one is given (as the Settings sheet shows each), else the choice alone (as Today's row does). */
function Lined({
  line,
  children,
}: {
  readonly line: Option.Option<string>;
  readonly children: ReactNode;
}) {
  const styles = useThemed(sheets);
  return Option.match(line, {
    onNone: () => children,
    onSome: (words) => (
      <View style={styles.lined}>
        <Text style={styles.line}>{words}</Text>
        {children}
      </View>
    ),
  });
}

/** The radio group `Minutes` over the session's minutes, the chosen one checked, under `line` when given; nothing until the session's view is read. */
export function MinutesChoice({ line }: { readonly line?: string }) {
  const styles = useThemed(sheets);
  const session = AsyncResult.value(useAtomValue(sessionView));
  const onMinutes = useAtomSet(chooseMinutes);
  return Option.match(session, {
    onNone: () => false,
    onSome: ({ minutes }) => (
      <Lined line={Option.fromUndefinedOr(line)}>
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

/** The voice's pill over the voice's choice, under `line` when given; nothing until the choice is read. */
export function VoiceChoice({ line }: { readonly line?: string }) {
  const voice = AsyncResult.value(useAtomValue(voiceView));
  const onVoice = useAtomSet(cycleVoice);
  return Option.match(voice, {
    onNone: () => false,
    onSome: ({ choice }) => (
      <Lined line={Option.fromUndefinedOr(line)}>
        <VoicePill choice={choice} onPress={() => onVoice()} />
      </Lined>
    ),
  });
}

/**
 * Whether Today's row of choices (`Choices`) shows. The app never provides
 * it, so Today shows no `Minutes` and no `Voice`: the Settings sheet is the
 * only place a reader chooses them. The test rigs that still tap Today's
 * choices provide it, through `src/test/choices-seam.tsx`; S5 deletes it
 * with `Choices`.
 */
export const ChoicesOnToday = createContext(false);

/** Today's row of the reader's choices, the minutes then the voice's pill, shown only under `ChoicesOnToday`; nothing otherwise. */
export function Choices() {
  const styles = useThemed(sheets);
  if (!use(ChoicesOnToday)) return false;
  return (
    <View style={styles.choices}>
      <MinutesChoice />
      <VoiceChoice />
    </View>
  );
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
  }),
);
