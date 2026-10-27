/**
 * The chords on a hymn page: each section drawn under its chords, in the key
 * the hymn's move reaches (a transpose and a capo, kept for the hymn, which
 * the bar's key button and dials set; `~/player/KeyButton.tsx`), and a
 * notice while chords are on for a hymn that has none yet.
 *
 * A syllable-level line is its syllables (`SyllableWords.tsx`), each a box
 * with its chords over it, in the body's own font, so a chord sits over the
 * syllable it changes on with no padded spaces. Both alignment levels keep
 * these compiled anchors, so a wrapped word takes its chords with it.
 * Line-level timing still marks the line whole.
 *
 * The chords are spelled in the key the move reaches, read from a context by
 * each chord's text alone: a turn of a dial redraws the chord texts, never
 * the sections.
 */

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

/** The key the chords are spelled in, as the hymn's move reaches it. */
const PlayedKey = createContext<Chord.Key>({ tonic: 'C', minor: false });

export const PlayedKeyProvider = PlayedKey.Provider;

/** While chords are on and the hymn has none yet, a notice that says so. */
export function ChordNotice({
  on,
  printed,
}: {
  readonly on: boolean;
  /** The hymn's printed key; none while chords are off or the hymn has none. */
  readonly printed: Chord.Key | 'none';
}) {
  if (!on || printed !== 'none') return <></>;
  return (
    <Text style={styles.notice} dynamicTypeRamp="footnote">
      No chords for this hymn yet.
    </Text>
  );
}

/**
 * A section's lines under their chords; `p` is its place on the page, from 1.
 * Both alignment levels draw the compiled anchors as boxes. Only chord
 * changes show; a chordless opening keeps an empty chord row.
 */
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
  /** The section's first line's place in the hymn as sung, from 0. */
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

/** A syllable box's chords, `chord-p-l-s`. */
const boxChords = (box: Box, place: string) => (
  <BoxChords chords={box.chords} id={`chord-${place}`} />
);

/**
 * A box's chords, or a row of no chord: a bare space as tall as a chord row,
 * which draws no view of its own, so a row of chordless words keeps a chord
 * row's height. The boxes of a line stand on their syllables' foot
 * (`SyllableWords.tsx`), so the syllables keep one baseline whatever the
 * system's text size makes of the chord rows.
 */
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

/**
 * Chord changes in order, spelled in the played key and chord colour. Where there
 * are chords, a tap opens the sheet of how to play them (`ChordSheet.tsx`):
 * the text is a button with no padding of its own, its target grown to 44
 * points tall by its hit slop alone, so the row it sits in does not move.
 */
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

/** A chord row's line height before the reader's size is applied. */
const CHORD_LINE = 20;

/** The least height of a tap target, in points. */
export const TAP_TARGET = 44;

/**
 * How far a chord's tap target reaches past its text: up and down, until it
 * is `TAP_TARGET` tall over a row `lineHeight` tall, and a little to each side.
 */
export const chordSlop = (lineHeight: number) => {
  const reach = Math.max(0, Math.ceil((TAP_TARGET - lineHeight) / 2));
  return { top: reach, bottom: reach, left: 6, right: 6 };
};

const styles = StyleSheet.create({
  notice: { fontSize: 13, color: color.muted },
  chord: { fontSize: 15, lineHeight: 20, fontWeight: '600', paddingRight: 6 },
  // As wide as a chord's own space after it, so a chordless box is never narrower than one.
  noChord: { width: 6 },
});
