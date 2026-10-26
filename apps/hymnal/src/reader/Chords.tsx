/**
 * The chords on a hymn page: each section drawn under its chords, in the key
 * the hymn's move reaches (a transpose and a capo, kept for the hymn, which
 * the bar's key button and dials set; `~/player/KeyButton.tsx`), and a
 * notice while chords are on for a hymn that has none yet.
 *
 * A syllable-level line is its syllables (`SyllableWords.tsx`), each a box
 * with its chords over it, in the body's own font, so a chord sits over the
 * syllable it changes on with no padded spaces. A line-level part shows each
 * line's chords in one row above the line's syllables.
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
import type { Box, SectionChords, Word } from '~/hymns/chords';

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
 * A syllable-level line is its syllables, each under its chords; a
 * line-level line is a row of its chords over its syllables (`syllables`,
 * the same part's syllables without chords).
 *
 * A line whose first syllable carries no chord shows the chord held over
 * from the line before (`shown.held`), muted: over its first syllable
 * (`held-p-l-1`), or first in its row (`held-p-l`).
 */
export const ChordLines = memo(function ChordLines({
  section,
  shown,
  syllables,
  p,
  first,
  style,
}: {
  readonly section: Section;
  readonly shown: Exclude<SectionChords, { readonly _tag: 'Words' }>;
  /** Each line's words as syllables. */
  readonly syllables: ReadonlyArray<ReadonlyArray<Word>>;
  readonly p: number;
  /** The section's first line's place in the hymn as sung, from 0. */
  readonly first: number;
  readonly style: StyleProp<TextStyle>;
}) {
  if (shown._tag === 'Line') {
    return section.lines.map((line, l) => (
      <View key={l} style={styles.lineLevel}>
        <View style={styles.row}>
          {Option.match(Option.flatten(Option.fromUndefinedOr(shown.held[l])), {
            onNone: () => [],
            onSome: (chord) => (
              <ChordText chords={[chord]} tone="held" testID={`held-${p}-${l + 1}`} />
            ),
          })}
          <ChordText chords={shown.lines[l] ?? []} testID={`chords-${p}-${l + 1}`} />
        </View>
        <SyllableLine
          words={syllables[l] ?? []}
          label={line}
          at={`${p}-${l + 1}`}
          index={first + l}
          style={style}
          over={Option.none()}
        />
      </View>
    ));
  }
  return shown.lines.map((words, l) => (
    <SyllableLine
      key={l}
      words={words}
      label={section.lines[l] ?? ''}
      at={`${p}-${l + 1}`}
      index={first + l}
      style={style}
      over={Option.some(
        Option.match(Option.flatten(Option.fromUndefinedOr(shown.held[l])), {
          onNone: () => boxChords,
          onSome: (chord) => heldOver(chord, `${p}-${l + 1}-1`),
        }),
      )}
    />
  ));
});

/** A syllable box's chords, `chord-p-l-s`. */
const boxChords = (box: Box, place: string) => (
  <BoxChords chords={box.chords} id={`chord-${place}`} />
);

/** A box's chords, and `held` over the box at `first` (`held-p-l-1`), which carries none. */
const heldOver = (held: Chord.Chord, first: string) => (box: Box, place: string) => {
  if (place !== first || box.chords.length > 0) return boxChords(box, place);
  return <ChordText chords={[held]} tone="held" testID={`held-${place}`} />;
};

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
 * Chords in order, spelled in the played key: a change in the chord colour, a
 * chord held over from the line before (`tone` `held`) muted. Where there
 * are chords, a tap opens the sheet of how to play them (`ChordSheet.tsx`):
 * the text is a button with no padding of its own, its target grown to 44
 * points tall by its hit slop alone, so the row it sits in does not move.
 */
function ChordText({
  chords,
  testID,
  tone = 'change',
}: {
  readonly chords: ReadonlyArray<Chord.Chord>;
  readonly testID: string;
  readonly tone?: 'change' | 'held';
}) {
  const key = use(PlayedKey);
  const text = usePageText();
  const tap = useChordTap();
  const names = chords.map((chord) => Chord.format(chord, key)).join(' ');
  const style = [
    styles.chord,
    text.chords,
    { color: { change: color.chord, held: color.muted }[tone] },
  ];
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
      aria-label={{ change: names, held: `${names}, held over` }[tone]}
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
  lineLevel: { marginBottom: 8 },
  row: { flexDirection: 'row' },
});
