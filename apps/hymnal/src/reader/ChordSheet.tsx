import * as Chord from '@manna/hymnal/chord';
import { Option, Schema } from 'effect';
import { createContext, use } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Href, type StackScreenOptions, useParams, useRouter } from 'one';

import { color, useAccent } from '~/color';
import { describe, fingeringOf } from '~/hymns/shapes';
import { available } from '~/tuner/native';

import { ChordBox } from './ChordBox';

const ChordTap = createContext<(chords: ReadonlyArray<Chord.Chord>) => void>(() => {});

export const ChordTapProvider = ChordTap.Provider;

export const useChordTap = () => use(ChordTap);

const ChordsParam = Schema.fromJsonString(Schema.Array(Chord.Chord));
const KeyParam = Schema.fromJsonString(Chord.Key);
const encodeChords = Schema.encodeSync(ChordsParam);
const encodeKey = Schema.encodeSync(KeyParam);
const decodeChords = Schema.decodeUnknownOption(ChordsParam);
const decodeKey = Schema.decodeUnknownOption(KeyParam);

export const chordHref = (chords: ReadonlyArray<Chord.Chord>, key: Chord.Key): Href =>
  `/chord?${String(new URLSearchParams({ chords: encodeChords(chords), key: encodeKey(key) }))}`;

export const chordSheetOptions = {
  title: 'Chord',
  headerShown: false,
  presentation: 'formSheet',
  sheetGrabberVisible: true,
  sheetAllowedDetents: [0.5, 1],
} satisfies StackScreenOptions;

export function ChordScreen() {
  const params = useParams<{ readonly chords?: string; readonly key?: string }>();
  const shown = Option.all({
    chords: decodeChords(params.chords),
    key: decodeKey(params.key),
  }).pipe(Option.filter(({ chords }) => chords.length > 0));
  return <ChordSheet shown={shown} />;
}

function ChordSheet({
  shown,
}: {
  readonly shown: Option.Option<{
    readonly chords: ReadonlyArray<Chord.Chord>;
    readonly key: Chord.Key;
  }>;
}) {
  const accent = useAccent();
  const router = useRouter();
  return (
    <View testID="chord-sheet" style={styles.sheet}>
      <View style={styles.head}>
        {available && (
          <Pressable
            role="button"
            aria-label="Tuner"
            onPress={() => router.push('/tuner')}
            hitSlop={12}
          >
            <Text style={[styles.done, { color: accent }]}>Tuner</Text>
          </Pressable>
        )}
        <Pressable role="button" aria-label="Done" onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.done, { color: accent }]}>Done</Text>
        </Pressable>
      </View>
      <View testID="chord-boxes" style={styles.boxes}>
        {Option.match(shown, {
          onNone: () => <Text style={styles.note}>No chord</Text>,
          onSome: ({ chords, key }) =>
            chords.map((chord, k) => <Played key={k} chord={chord} playedKey={key} at={k} />),
        })}
      </View>
    </View>
  );
}

function Played({
  chord,
  playedKey,
  at,
}: {
  readonly chord: Chord.Chord;
  readonly playedKey: Chord.Key;
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
            label={describe(fingering, name, playedAs)}
            testID={`chord-box-${at}`}
          />
        </View>
      );
    },
  });
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: color.ground,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 16,
  },
  head: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 24 },
  done: { fontSize: 17, fontWeight: '600' },
  boxes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 24 },
  played: { alignItems: 'center', gap: 6 },
  name: { fontSize: 20, fontWeight: '700', color: color.ink },
  note: { fontSize: 13, color: color.muted },
});
