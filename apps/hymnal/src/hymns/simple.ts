import type * as Chord from '@manna/hymnal/chord';
import { Array as Arr, Option, Schema } from 'effect';

import type { Box, HymnChords, Word } from './chords';

export const ChordStyle = Schema.Literals(['simple', 'advanced']);
export type ChordStyle = typeof ChordStyle.Type;

const mod12 = (n: number) => ((n % 12) + 12) % 12;

interface Plain {
  readonly root: number;
  readonly quality: '' | 'm' | '7';
}

interface Change {
  readonly k: number;
  readonly chord: Plain;
}

const SUS: ReadonlySet<Chord.Quality> = new Set(['sus4', 'sus2', '7sus4']);

const plain = (chord: Chord.Chord): Plain => {
  const { root } = chord;
  switch (chord.quality) {
    case '':
    case 'm':
    case '7':
      return { root, quality: chord.quality };
    case 'm7':
    case 'm6':
      return { root, quality: 'm' };
    case 'maj7':
    case '6':
    case 'aug':
    case 'sus4':
    case 'sus2':
      return { root, quality: '' };
    case '7sus4':
      return { root, quality: '7' };
    case 'dim':
    case 'dim7':
      return { root: mod12(root - 4), quality: '7' };
    case 'm7b5':
      return { root: mod12(root + 3), quality: 'm' };
  }
};

const plainLine = (chords: ReadonlyArray<Chord.Chord>): ReadonlyArray<Plain> =>
  chords.map((chord, k) =>
    Option.some(chord).pipe(
      Option.filter((c) => SUS.has(c.quality)),
      Option.flatMap(() => Arr.findFirst(chords.slice(k + 1), (later) => !SUS.has(later.quality))),
      Option.filter((next) => next.root === chord.root),
      Option.match({
        onNone: () => plain(chord),
        onSome: (next) => ({ root: chord.root, quality: plain(next).quality }),
      }),
    ),
  );

const same = (a: Plain, b: Plain) => a.root === b.root && a.quality === b.quality;

const soundingAt = (boxes: ReadonlyArray<Box>): ReadonlyArray<Option.Option<Plain>> => {
  const plained = plainLine(boxes.flatMap((box) => box.chords));
  let next = 0;
  let sounding = Option.none<Plain>();
  return boxes.map((box) => {
    if (box.chords.length === 0) return sounding;
    const first = Arr.get(plained, next);
    next += box.chords.length;
    sounding = Arr.get(plained, next - 1);
    return first;
  });
};

const changesOf = (at: ReadonlyArray<Option.Option<Plain>>): ReadonlyArray<Change> => {
  const changes: Array<Change> = [];
  for (const [k, sounding] of at.entries())
    for (const chord of Option.toArray(sounding))
      if (!Option.exists(Arr.last(changes), (last) => same(last.chord, chord)))
        changes.push({ k, chord });
  return changes;
};

const withoutPassing = (changes: ReadonlyArray<Change>): ReadonlyArray<Change> => {
  const kept: Array<Change> = [];
  let skip = false;
  for (const [c, change] of changes.entries()) {
    const passing: boolean =
      !skip &&
      Option.exists(Arr.last(kept), (before) =>
        Option.exists(
          Arr.get(changes, c + 1),
          (after) => after.k === change.k + 1 && same(before.chord, after.chord),
        ),
      );
    if (!skip && !passing) kept.push(change);
    skip = passing;
  }
  return kept;
};

const simpleLine = (line: ReadonlyArray<Word>): ReadonlyArray<Word> => {
  const shown = new Map(
    withoutPassing(changesOf(soundingAt(line.flat()))).map(({ k, chord }) => [k, chord]),
  );
  let k = 0;
  return line.map((word) =>
    word.map((box) => {
      const chords = Option.toArray(Option.fromUndefinedOr(shown.get(k)));
      k += 1;
      return { text: box.text, chords };
    }),
  );
};

type PartChords = HymnChords['stanzas'][number];

const simplePart = (part: PartChords): PartChords => {
  if (part._tag === 'Plain') return part;
  return { ...part, lines: part.lines.map(simpleLine) };
};

export const simple = (chords: HymnChords): HymnChords => ({
  ...chords,
  stanzas: chords.stanzas.map(simplePart),
  refrain: Option.map(chords.refrain, simplePart),
});

const byStyle: Record<ChordStyle, (chords: HymnChords) => HymnChords> = {
  simple,
  advanced: (chords) => chords,
};

export const styled = (chords: HymnChords, style: ChordStyle): HymnChords => byStyle[style](chords);
