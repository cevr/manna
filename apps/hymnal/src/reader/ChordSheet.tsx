/**
 * The sheet a tap on a chord opens: how to play each chord the tapped place
 * shows, as the page shows it (the played key, under the capo), each as a
 * chord box (`ChordBox.tsx`) under its name, and the capo when there is one.
 * A chord played over its root instead of its bass says so under its name;
 * a chord with no fingering says that.
 *
 * The sheet is a plain modal over the page, with no animation and no sound,
 * closed by Done, by a tap on the dimmed page, or by the system's back.
 * The page under it does not move.
 */

import * as Chord from '@bible/hymnal/chord';
import { Option } from 'effect';
import { createContext, use } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { color, useAccent } from '~/color';
import { describe, fingeringOf } from '~/hymns/shapes';

import { ChordBox } from './ChordBox';

/** Opens the sheet on the chords a place shows. A page without a sheet opens nothing. */
const ChordTap = createContext<(chords: ReadonlyArray<Chord.Chord>) => void>(() => {});

export const ChordTapProvider = ChordTap.Provider;

export const useChordTap = () => use(ChordTap);

export function ChordSheet({
  chords,
  playedKey,
  capo,
  onClose,
}: {
  /** The chords the tapped place shows. The page draws the sheet only while one is open. */
  readonly chords: ReadonlyArray<Chord.Chord>;
  readonly playedKey: Chord.Key;
  readonly capo: number;
  readonly onClose: () => void;
}) {
  const accent = useAccent();
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.frame}>
        <Pressable
          aria-label="Close chord"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          testID="chord-sheet-backdrop"
        />
        <View testID="chord-sheet" role="dialog" aria-modal style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.note} testID="chord-sheet-capo">
              {(capo > 0 && `Capo ${capo}`) || 'No capo'}
            </Text>
            <Pressable role="button" aria-label="Done" onPress={onClose} hitSlop={12}>
              <Text style={[styles.done, { color: accent }]}>Done</Text>
            </Pressable>
          </View>
          <View style={styles.boxes}>
            {chords.map((chord, k) => (
              <Played key={k} chord={chord} playedKey={playedKey} capo={capo} at={k} />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** One chord's name over its box, or a word that it has none. */
function Played({
  chord,
  playedKey,
  capo,
  at,
}: {
  readonly chord: Chord.Chord;
  readonly playedKey: Chord.Key;
  readonly capo: number;
  readonly at: number;
}) {
  const name = Chord.format(chord, playedKey);
  return Option.match(fingeringOf(chord, playedKey), {
    onNone: () => (
      <View style={styles.played}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.note}>No fingering for this chord yet.</Text>
      </View>
    ),
    onSome: (fingering) => {
      const playedAs = Option.map(fingering.playedAs, (as) => Chord.format(as, playedKey));
      return (
        <View style={styles.played}>
          <Text style={styles.name} aria-hidden>
            {name}
          </Text>
          {Option.match(playedAs, {
            onNone: () => [],
            onSome: (as) => (
              <Text style={styles.note} aria-hidden>
                {`Played as ${as}`}
              </Text>
            ),
          })}
          <ChordBox
            fingering={fingering}
            label={describe(fingering, name, playedAs, capo)}
            testID={`chord-box-${at}`}
          />
        </View>
      );
    },
  });
}

const styles = StyleSheet.create({
  frame: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  sheet: {
    backgroundColor: color.ground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 16,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  done: { fontSize: 17, fontWeight: '600' },
  boxes: { flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
  played: { alignItems: 'center', gap: 6 },
  name: { fontSize: 20, fontWeight: '700', color: color.ink },
  note: { fontSize: 13, color: color.muted },
});
