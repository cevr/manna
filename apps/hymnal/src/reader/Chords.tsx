import * as Chord from '@manna/hymnal/chord';
import { Option } from 'effect';
import { createContext, memo, use } from 'react';
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';

import { color } from '~/color';
import type { Section } from '~/hymns/hymns';
import type { Box, SectionChords } from '~/hymns/chords';

import { SyllableLine } from './SyllableWords';
import { useChordTap } from './ChordSheet';
import { usePageText } from './pageText';

const PlayedKey = createContext<Chord.Key>({ tonic: 'C', minor: false });

export const PlayedKeyProvider = PlayedKey.Provider;

export function ChordNotice({
  on,
  printed,
}: {
  readonly on: boolean;
  readonly printed: Chord.Key | 'none';
}) {
  if (!on || printed !== 'none') return <></>;
  return (
    <Text style={styles.notice} dynamicTypeRamp="footnote">
      No chords for this hymn yet.
    </Text>
  );
}

export const ChordLines = memo(function ChordLines({
  section,
  shown,
  p,
  first,
  style,
}: {
  readonly section: Section;
  readonly shown: Exclude<SectionChords, { readonly _tag: 'Words' }>;
  readonly p: number;
  readonly first: number;
  readonly style: StyleProp<TextStyle>;
}) {
  return shown.lines.map((words, l) => (
    <SyllableLine
      key={l}
      words={words}
      label={section.lines[l] ?? ''}
      at={`${p}-${l + 1}`}
      index={first + l}
      style={style}
      over={Option.some(boxChords)}
    />
  ));
});

const boxChords = (box: Box, place: string) => (
  <BoxChords chords={box.chords} id={`chord-${place}`} />
);

function BoxChords({
  chords,
  id,
}: {
  readonly chords: ReadonlyArray<Chord.Chord>;
  readonly id: string;
}) {
  const text = usePageText();
  const { fontScale } = useWindowDimensions();
  if (chords.length === 0)
    return (
      <View
        style={[styles.noChord, { height: (text.chords.lineHeight ?? CHORD_LINE) * fontScale }]}
      />
    );
  return <ChordText chords={chords} testID={id} />;
}

function ChordText({
  chords,
  testID,
}: {
  readonly chords: ReadonlyArray<Chord.Chord>;
  readonly testID: string;
}) {
  const key = use(PlayedKey);
  const text = usePageText();
  const tap = useChordTap();
  const names = chords.map((chord) => Chord.format(chord, key)).join(' ');
  const style = [styles.chord, text.chords, { color: color.chord }];
  if (chords.length === 0)
    return (
      <Text testID={testID} style={style} dynamicTypeRamp="subheadline">
        {'​'}
      </Text>
    );
  const shown = (
    <Text style={style} dynamicTypeRamp="subheadline">
      {names}
    </Text>
  );
  return (
    <Pressable
      testID={testID}
      role="button"
      aria-label={names}
      accessibilityHint="Shows how to play it"
      hitSlop={chordSlop(text.chords.lineHeight ?? CHORD_LINE)}
      onPress={() => tap(chords)}
    >
      {shown}
    </Pressable>
  );
}

const CHORD_LINE = 20;

export const TAP_TARGET = 44;

export const chordSlop = (lineHeight: number) => {
  const reach = Math.max(0, Math.ceil((TAP_TARGET - lineHeight) / 2));
  return { top: reach, bottom: reach, left: 6, right: 6 };
};

const styles = StyleSheet.create({
  notice: { fontSize: 13, color: color.muted },
  chord: { fontSize: 15, lineHeight: 20, fontWeight: '600', paddingRight: 6 },
  noChord: { width: 6 },
});
