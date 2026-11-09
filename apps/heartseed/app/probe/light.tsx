import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { holdReading, letGo, listenTo, readingAloud, seekTo, voiceView } from '../../src/app';
import { versesOf } from '../../src/kjv';
import { themed, useThemed } from '../../src/look';
import { ReadingView, type Hold } from '../../src/reading/view';
import { shownWordsOf } from '../../src/reading/words';

const dev = typeof __DEV__ !== 'undefined' && __DEV__;

/** The probe's verse: John 3:16 whole, long enough to wrap over several lines. */
const VERSE = versesOf(43, 3)[15] ?? '';

/** The verse's word count, the voice's own (`shownWordsOf` gives one entry a word). */
const WORDS = shownWordsOf(VERSE).length;

/** How many words `Back 3` and `Forward 3` move the read point. */
const STEP = 3;

/**
 * A development probe for the live check of the reading view
 * (verify-heartseed, `light-probe-read`, `light-probe-seek-back`,
 * `light-probe-seek-forward`, `light-probe-scroll`): John 3:16 in a scroll
 * view taller than the screen, drawn by the reading view, hold included,
 * while the voice reads it and whole otherwise; `Listen` reads it
 * (`listenTo`), `Back 3` and `Forward 3` seek three words from the lit
 * point (`seekTo`), since the simulator's driver has no long-press drag,
 * and a status line reads `lit <lit>/<words> <status>`. It takes only
 * `src/app.ts`'s atoms and builds no service. A release build renders
 * nothing.
 */
export default function LightProbe() {
  const styles = useThemed(sheets);
  const voice = AsyncResult.value(useAtomValue(voiceView));
  const onListen = useAtomSet(listenTo);
  const onSeek = useAtomSet(seekTo);
  const onHold = useAtomSet(holdReading);
  const onLetGo = useAtomSet(letGo);
  const [heldWord, setHeld] = useState<Option.Option<number>>(Option.none());
  const reading = Option.filter(voice, (view) => readingAloud(view) && view.verse === VERSE);
  const held = Option.filter(heldWord, () => Option.isSome(reading));
  if (!dev) return;
  const hold: Hold = { held, onHeld: setHeld, onHold, onSeek, onLetGo };
  const lit = Option.match(reading, { onNone: () => 0, onSome: (view) => view.lit });
  const status = Option.match(voice, { onNone: () => 'none', onSome: (view) => view.status });
  const buttons = [
    { label: 'Listen', onPress: () => onListen(VERSE) },
    { label: `Back ${STEP}`, onPress: () => onSeek(Math.max(0, lit - STEP)) },
    { label: `Forward ${STEP}`, onPress: () => onSeek(Math.min(WORDS - 1, lit + STEP)) },
  ];
  return (
    <ScrollView scrollEnabled={Option.isNone(held)} contentContainerStyle={styles.content}>
      <Text role="heading" aria-level={1} style={styles.heading}>
        Light probe
      </Text>
      <Text testID="light-status" style={styles.line}>
        {`lit ${lit}/${WORDS} ${status}`}
      </Text>
      <View style={styles.buttons}>
        {buttons.map((button) => (
          <Pressable
            key={button.label}
            role="button"
            aria-label={button.label}
            onPress={button.onPress}
            style={styles.button}
          >
            <Text style={styles.line}>{button.label}</Text>
          </Pressable>
        ))}
      </View>
      {Option.match(reading, {
        onNone: () => (
          <Text testID="passage" style={styles.verse}>
            {VERSE}
          </Text>
        ),
        onSome: (view) => <ReadingView text={VERSE} view={view} hold={hold} />,
      })}
      <View style={styles.below} />
    </ScrollView>
  );
}

const sheets = themed((roles, each) =>
  StyleSheet.create({
    content: { paddingTop: 80, paddingHorizontal: 24, gap: 16, backgroundColor: roles.ground },
    heading: { fontSize: 28, fontFamily: each, color: roles.ink },
    line: { fontSize: 17, fontFamily: each, color: roles.ink },
    buttons: { flexDirection: 'row', gap: 12 },
    button: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
    verse: { fontSize: 24, lineHeight: 36, fontFamily: each, color: roles.ink },
    below: { height: 1600 },
  }),
);
