/**
 * The sheet a tap on a chord opens: how to play each chord the tapped place
 * shows, as the page shows it (in the played key), each as a chord box
 * (`ChordBox.tsx`) under its name, centred in the sheet. A chord played
 * over its root instead of its bass says so under its name; a chord with no
 * fingering says that.
 *
 * The sheet is a route, `/chord`, presented as a native form sheet with a
 * grabber (`chordSheetOptions`), of one family with the player sheet: a drag
 * down closes it, as does `Done`. Its params name the chords and the played
 * key, so the page under it does not move and the follow hears nothing. It
 * says no capo: a shape is the same at any fret, so a played chord's sheet is
 * the same at every capo.
 */

import * as Chord from '@manna/hymnal/chord';
import { Option, Schema } from 'effect';
import { createContext, use } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Href, type StackScreenOptions, useParams, useRouter } from 'one';

import { color, useAccent } from '~/color';
import { describe, fingeringOf } from '~/hymns/shapes';

import { ChordBox } from './ChordBox';

/** Opens the sheet on the chords a place shows. A page without a sheet opens nothing. */
const ChordTap = createContext<(chords: ReadonlyArray<Chord.Chord>) => void>(() => {});

export const ChordTapProvider = ChordTap.Provider;

export const useChordTap = () => use(ChordTap);

/** The chord route's params: the chords a place shows and the key they are played in, each as JSON. */
const ChordsParam = Schema.fromJsonString(Schema.Array(Chord.Chord));
const KeyParam = Schema.fromJsonString(Chord.Key);
const encodeChords = Schema.encodeSync(ChordsParam);
const encodeKey = Schema.encodeSync(KeyParam);
const decodeChords = Schema.decodeUnknownOption(ChordsParam);
const decodeKey = Schema.decodeUnknownOption(KeyParam);

/** The sheet's route for `chords` played in `key`. */
export const chordHref = (chords: ReadonlyArray<Chord.Chord>, key: Chord.Key): Href =>
  `/chord?${String(new URLSearchParams({ chords: encodeChords(chords), key: encodeKey(key) }))}`;

/** How the stack presents the chord route: a form sheet with a grabber, no header. */
export const chordSheetOptions = {
  title: 'Chord',
  headerShown: false,
  presentation: 'formSheet',
  sheetGrabberVisible: true,
  sheetAllowedDetents: [0.5, 1],
} satisfies StackScreenOptions;

/** The chord route's screen: the sheet for the chords its params name, or a word that they name none. */
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

/** One chord's name over its box, or a word that it has none. */
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
  head: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  done: { fontSize: 17, fontWeight: '600' },
  boxes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 24 },
  played: { alignItems: 'center', gap: 6 },
  name: { fontSize: 20, fontWeight: '700', color: color.ink },
  note: { fontSize: 13, color: color.muted },
});
