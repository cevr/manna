/**
 * A hymn's chords as the reader shows them over its words, and its sung
 * syllables, which the page shows whether chords are on or off. The bundle
 * carries them in a module of their own (`virtual:hymnal-chords`, made by
 * `vite/chords.ts`), one compact string per hymn, so the words stay as they
 * are; a hymn's string is decoded the first time its page is shown, and kept
 * (`chordBook`).
 *
 * The chords are the compiled set's `guitar` level, as degrees above the
 * hymn's key: a move (a transpose and a capo fret) changes the key they are
 * spelled in and nothing else. Spelling is the hymnal package's own
 * (`Chord.format`, `Chord.keyOnPitch`); this module only picks the key.
 */

import * as Chord from '@manna/hymnal/chord';
import type { Hymn, Part } from '@manna/hymnal/hymn';
import { Placements, type PlacementPatch } from '@manna/hymnal/playback';
import type { Placement } from '@manna/hymnal/placement';
import { Array as Arr, Effect, Option, Schema } from 'effect';

import type { HymnText, Section } from './text';

// ----------------------------------------------------------------------------
// The chords of a hymn
// ----------------------------------------------------------------------------

/** One sung syllable: its text as printed under the note, and the chords that change on it, in order. */
export interface Box {
  readonly text: string;
  readonly chords: ReadonlyArray<Chord.Chord>;
}

/** A word's syllables, which stay together on one row. */
export type Word = ReadonlyArray<Box>;

/** A part as the reader shows it: words alone, or its lines' words with their chords at a level. */
type PartChords =
  | { readonly _tag: 'Plain' }
  | {
      readonly _tag: 'Sung';
      readonly level: 'syllable' | 'line';
      readonly lines: ReadonlyArray<ReadonlyArray<Word>>;
    };

export interface HymnChords {
  readonly number: number;
  readonly key: Chord.Key;
  /** Stanza n is `stanzas[n - 1]`. */
  readonly stanzas: ReadonlyArray<PartChords>;
  readonly refrain: Option.Option<PartChords>;
}

/**
 * A section's words, with chords on or off: its words alone (`Words`), or
 * its lines' syllable boxes and their chord changes (`Syllables`).
 * Both alignment levels keep the compiled syllable anchors. A syllable
 * with no change shows no chord, including at the start of a line.
 */
export type SectionChords =
  | { readonly _tag: 'Words' }
  | {
      readonly _tag: 'Syllables';
      readonly lines: ReadonlyArray<ReadonlyArray<Word>>;
    };

const words: SectionChords = { _tag: 'Words' };

const partOf = (chords: HymnChords, section: Section): Option.Option<PartChords> => {
  if (section.kind === 'refrain') return chords.refrain;
  return Option.fromUndefinedOr(chords.stanzas[section.n - 1]);
};

type SungPart = Extract<PartChords, { readonly _tag: 'Sung' }>;

/** The section's sung part, none for a Plain part or one whose lines are not the section's. */
const sungOf = (chords: HymnChords, section: Section): Option.Option<SungPart> =>
  Option.filter(
    partOf(chords, section),
    (part): part is SungPart => part._tag === 'Sung' && part.lines.length === section.lines.length,
  );

/** Each section of `text`, in page order, at either source alignment level. */
export const sectionsOf = (text: HymnText, chords: HymnChords): ReadonlyArray<SectionChords> =>
  text.sections.map((section) =>
    Option.match(sungOf(chords, section), {
      onNone: () => words,
      onSome: (part): SectionChords => ({ _tag: 'Syllables', lines: part.lines }),
    }),
  );

/** Whether any part of the hymn carries a chord. */
export const hasChords = (chords: HymnChords): boolean =>
  [...chords.stanzas, ...Option.toArray(chords.refrain)].some(
    (part) =>
      part._tag === 'Sung' &&
      part.lines.some((line) => line.some((word) => word.some((box) => box.chords.length > 0))),
  );

// ----------------------------------------------------------------------------
// Transpose and capo
// ----------------------------------------------------------------------------

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/**
 * A hymn's move: `transpose`, semitones the sounding key is raised (stored
 * -5..6, so twelve is none), and `capo`, the fret, 0..11: the chords are
 * shown as shapes that many semitones below the sounding key.
 */
export const Move = Schema.Struct({
  transpose: Schema.Int.check(Schema.isBetween({ minimum: -5, maximum: 6 })),
  capo: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 11 })),
});
export type Move = typeof Move.Type;

/** No transpose and no capo: the hymn as printed. */
export const still: Move = { transpose: 0, capo: 0 };

/** `move` with its sounding key raised `by` semitones, wrapped into -5..6. */
export const transposed = (move: Move, by: number): Move => ({
  ...move,
  transpose: mod12(move.transpose + by + 5) - 5,
});

/** `move` with its capo `by` frets higher, held to 0..11. */
export const capoed = (move: Move, by: number): Move => ({
  ...move,
  capo: Math.min(11, Math.max(0, move.capo + by)),
});

/**
 * The key `semitones` above `key`: `key` itself at a whole number of
 * octaves, so a hymn printed in G-flat stays G-flat, and otherwise the key
 * a signature names on that pitch (`Chord.keyOnPitch`).
 */
const keyAbove = (key: Chord.Key, semitones: number): Chord.Key => {
  if (mod12(semitones) === 0) return key;
  return Chord.keyOnPitch(Chord.pitchClass(key.tonic) + semitones, key.minor);
};

/** The key the hymn sounds in after `move`'s transpose. */
export const soundingKey = (key: Chord.Key, move: Move): Chord.Key => keyAbove(key, move.transpose);

/** The key the chords are shown in: the sounding key, less the capo. */
export const playedKey = (key: Chord.Key, move: Move): Chord.Key =>
  keyAbove(key, move.transpose - move.capo);

/** A key as a chord chart names it: "Db", "Dm". */
export const keyName = (key: Chord.Key): string => `${key.tonic}${mark(key.minor, 'm')}`;

/** `text` where `when` holds, else nothing. */
const mark = (when: boolean, text: string): string => (when && text) || '';

// ----------------------------------------------------------------------------
// The bundled encoding
// ----------------------------------------------------------------------------

/*
 * A hymn's string is JSON: `[number, tonic, minor, stanzas, refrain]`, with
 * an optional sixth string carrying encoded numeric placement alternatives; the
 * refrain 0 when there is none. A part is 0 when `Plain`, else
 * `[level, lines]`, each line one string: its syllables joined by `|`, each
 * `+` first when it is in the word before it, then its text, then, when it
 * carries chords, `~` and its guitar chords in `at` order, space-separated.
 * A chord is its root as a hex degree, its quality, and `/` and the bass's
 * hex degree when it has one ("0", "5m7", "7/b"). A syllable's text holds
 * none of `|`, `~` and `+`: the build fails on one that does (`encodeHymn`).
 */

const EncodedSung = Schema.Tuple([
  Schema.Literals(['syllable', 'line']),
  Schema.NonEmptyArray(Schema.String),
]);
const EncodedPart = Schema.Union([Schema.Literal(0), EncodedSung]);
const EncodedHymn = Schema.Tuple([
  Schema.Int,
  Schema.String,
  Schema.Boolean,
  Schema.Array(EncodedPart),
  EncodedPart,
  // Keep alternatives encoded until selected: the default reading allocates
  // neither their patch arrays nor their chord objects.
  Schema.optionalKey(Schema.String),
]);
type EncodedPart = typeof EncodedPart.Type;
const encodeEncoded = Schema.encodeOption(Schema.fromJsonString(EncodedHymn));
const encodePlacements = Schema.encodeOption(Schema.fromJsonString(Placements));
const decodePlacements = Schema.decodeUnknownOption(Schema.fromJsonString(Placements));

const tokenOf = (chord: Chord.Chord): string =>
  `${chord.root.toString(16)}${chord.quality}${Option.match(Option.fromUndefinedOr(chord.bass), {
    onNone: () => '',
    onSome: (bass) => `/${bass.toString(16)}`,
  })}`;

type Syllable = Extract<Part, { readonly _tag: 'Sung' }>['lines'][number][number];

/** One syllable as its line's string carries it; none for a text the encoding cannot carry. */
const syllableOf = (syllable: Syllable, joins: boolean): Option.Option<string> => {
  if (/[|~+]/.test(syllable.text)) return Option.none();
  const tokens = Option.getOrElse(Option.fromUndefinedOr(syllable.guitar), () => [])
    .toSorted((a, b) => a.at - b.at)
    .map((placed) => tokenOf(placed.chord));
  const chords = mark(tokens.length > 0, `~${tokens.join(' ')}`);
  return Option.some(`${mark(joins, '+')}${syllable.text}${chords}`);
};

const encodePart = (part: Part): Option.Option<EncodedPart> => {
  if (part._tag === 'Plain') return Option.some(0);
  return Option.map(
    Option.filter(
      Option.all(
        part.lines.map((line) =>
          Option.map(
            Option.all(
              line.map((syllable, k) =>
                syllableOf(syllable, k > 0 && line.at(k - 1)?.word === syllable.word),
              ),
            ),
            (syllables) => syllables.join('|'),
          ),
        ),
      ),
      Arr.isReadonlyArrayNonEmpty<string>,
    ),
    (lines): EncodedPart => [part.level, lines],
  );
};

/** `hymn`'s chords as the bundle carries them; none for a syllable the encoding cannot carry. */
export const encodeHymn = (hymn: Hymn, placements?: Placements): Option.Option<string> =>
  Option.all({
    stanzas: Option.all(hymn.stanzas.map(encodePart)),
    refrain: Option.match(Option.fromUndefinedOr(hymn.refrain), {
      onNone: () => Option.some<EncodedPart>(0),
      onSome: (refrain) => encodePart(refrain.part),
    }),
  }).pipe(
    Option.flatMap(({ stanzas, refrain }) =>
      Option.match(Option.fromUndefinedOr(placements), {
        onNone: () =>
          encodeEncoded([hymn.number, hymn.key.tonic, hymn.key.minor, stanzas, refrain]),
        onSome: (modes) =>
          Option.flatMap(encodePlacements(modes), (encoded) =>
            encodeEncoded([hymn.number, hymn.key.tonic, hymn.key.minor, stanzas, refrain, encoded]),
          ),
      }),
    ),
  );

const decodeEncoded = Schema.decodeUnknownOption(Schema.fromJsonString(EncodedHymn));
const isKey = Schema.is(Chord.Key);

/** The complete finite token vocabulary. Repeated chords share immutable values. */
const tokens = new Map<string, Chord.Chord>();
for (let root = 0; root < 12; root++)
  for (const quality of Chord.Quality.literals) {
    const token = `${root.toString(16)}${quality}`;
    tokens.set(token, { root, quality });
    for (let bass = 0; bass < 12; bass++)
      tokens.set(`${token}/${bass.toString(16)}`, { root, quality, bass });
  }
/** A line's syllables, grouped into words. */
const wordsOf = (line: string): Option.Option<ReadonlyArray<Word>> => {
  const grouped: Array<Array<Box>> = [];
  for (const encoded of line.split('|')) {
    const joins = encoded.startsWith('+');
    const body = encoded.slice(Number(joins));
    const delimiter = body.indexOf('~');
    const chords: Chord.Chord[] = [];
    let text = body;
    if (delimiter >= 0) {
      if (body.indexOf('~', delimiter + 1) >= 0) return Option.none();
      text = body.slice(0, delimiter);
      for (const token of body.slice(delimiter + 1).split(' ')) {
        const chord = tokens.get(token);
        if (!chord) return Option.none();
        chords.push(chord);
      }
    }
    const box = { text, chords };
    const last = grouped.at(-1);
    if (joins && last) last.push(box);
    else grouped.push([box]);
  }
  return Option.some(grouped);
};

const decodePart = (part: EncodedPart): Option.Option<PartChords> => {
  if (part === 0) return Option.some({ _tag: 'Plain' });
  const [level, lines] = part;
  return Option.map(Option.all(lines.map(wordsOf)), (decoded) => ({
    _tag: 'Sung',
    level,
    lines: decoded,
  }));
};

/** A hymn's chords from its bundled string; none for a string that does not decode. */
export const decodeHymn = (
  encoded: string,
  placement: Placement = 'beat',
): Option.Option<HymnChords> =>
  Option.flatMap(decodeEncoded(encoded), ([number, tonic, minor, stanzas, refrain, placements]) => {
    const key = { tonic, minor };
    if (!isKey(key)) return Option.none();
    return Option.all({
      stanzas: Option.all(stanzas.map(decodePart)),
      refrain: decodeRefrain(refrain),
    }).pipe(
      Option.map(({ stanzas, refrain }) => ({ number, key, stanzas, refrain })),
      Option.flatMap((hymn) => {
        if (placement === 'beat') return Option.some(hymn);
        return Option.match(Option.fromUndefinedOr(placements), {
          onNone: () => Option.some(hymn),
          onSome: (value) =>
            Option.flatMap(decodePlacements(value), (modes) => placed(hymn, modes[placement])),
        });
      }),
    );
  });

/** Apply numeric alternatives before Simple/Advanced spelling, retaining every word and box. */
const placed = (
  hymn: HymnChords,
  patches: readonly PlacementPatch[],
): Option.Option<HymnChords> => {
  const parts = [...hymn.stanzas, ...Option.toArray(hymn.refrain)];
  for (const [p, l, k] of patches) {
    const part = parts[p];
    if (part?._tag !== 'Sung' || !part.lines[l]?.flat()[k]) return Option.none();
  }
  const at = new Map(patches.map(([p, l, k, changes]) => [`${p}:${l}:${k}`, changes]));
  const apply = (part: PartChords, p: number): PartChords => {
    if (part._tag === 'Plain') return part;
    return {
      ...part,
      lines: part.lines.map((line, l) => {
        let k = 0;
        return line.map((word) =>
          word.map((box) => {
            const changes = at.get(`${p}:${l}:${k++}`);
            if (!changes) return box;
            return {
              text: box.text,
              chords: changes
                .toSorted((a, b) => a[3] - b[3])
                .map(([root, quality, bass]): Chord.Chord => {
                  const chord = { root, quality: Arr.getUnsafe(Chord.Quality.literals, quality) };
                  if (bass < 0) return chord;
                  return { ...chord, bass };
                }),
            };
          }),
        );
      }),
    };
  };
  return Option.some({
    ...hymn,
    stanzas: hymn.stanzas.map(apply),
    refrain: Option.map(hymn.refrain, (part) => apply(part, hymn.stanzas.length)),
  });
};

/** The refrain's part, none (decoded) for a hymn with no refrain. */
const decodeRefrain = (refrain: EncodedPart): Option.Option<Option.Option<PartChords>> => {
  if (refrain === 0) return Option.some(Option.none());
  return Option.map(decodePart(refrain), Option.some);
};

/**
 * The bundled chords, each hymn and placement decoded on first use and
 * kept. A failed hymn and placement has no chords, logged once
 * (`chords.decode.failed`); `decodes` counts the strings decoded.
 */
export const chordBook = (bundled: ReadonlyArray<readonly [number, string]>) => {
  const encoded = new Map(bundled);
  const kept = new Map<string, Option.Option<HymnChords>>();
  let decodes = 0;
  const decode = (number: number, placement: Placement): Option.Option<HymnChords> => {
    decodes += 1;
    const chords = Option.flatMap(Option.fromUndefinedOr(encoded.get(number)), (text) =>
      decodeHymn(text, placement),
    );
    if (Option.isNone(chords))
      Effect.runSync(
        Effect.logWarning(`[hymnal] chords.decode.failed number=${number} placement=${placement}`),
      );
    return chords;
  };
  return {
    /** The chords of hymn `number`, none when the bundle has none that decode. */
    of: (number: number, placement: Placement = 'beat'): Option.Option<HymnChords> =>
      Option.getOrElse(Option.fromUndefinedOr(kept.get(`${number}:${placement}`)), () => {
        const chords = decode(number, placement);
        kept.set(`${number}:${placement}`, chords);
        return chords;
      }),
    decodes: () => decodes,
  };
};
export type ChordBook = ReturnType<typeof chordBook>;
