/** Numeric playback metadata. Words stay in the read-only corpus; cuts are
 * offsets into its words. Timing and chords come from one fresh compilation.
 * The build supplies the fingerprint of the corpus and compiler inputs.
 */
import { Array as Arr, Effect, Schema } from 'effect';
import type { Mutable } from 'effect/Types';
import * as Chord from './chord.js';
import { type Hymn, type Part, type Plain, type Syllable, Reason, Timing } from './hymn.js';

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Quality = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: Chord.Quality.literals.length - 1 }),
);
const Change = Schema.Struct({
  root: Chord.Degree,
  quality: Quality,
  bass: Schema.Int.check(Schema.isBetween({ minimum: -1, maximum: 11 })),
  at: Schema.Finite,
});
const Cut = Schema.Struct({
  word: Count,
  offset: Count,
  length: Count,
  notes: Count,
  beats: Schema.Finite,
  full: Schema.Array(Change),
  guitar: Schema.Array(Change),
});
const NumericPart = Schema.Struct({
  level: Schema.Literals([0, 1, 2]),
  why: Schema.Array(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Reason.literals.length - 1 })),
  ),
  lines: Schema.Array(Schema.Array(Cut)),
  fit: Schema.Array(Schema.Finite),
});
export const Playback = Schema.Struct({
  version: Schema.Literal(1),
  number: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 695 })),
  sourceHash: Schema.String,
  timing: Timing,
  verses: Schema.Struct({ text: Count, midi: Count, exact: Schema.Boolean }),
  stanzas: Schema.Array(NumericPart),
  refrain: Schema.Array(NumericPart),
});
export type Playback = typeof Playback.Type;

export class PlaybackMismatch extends Schema.TaggedError<PlaybackMismatch>()('PlaybackMismatch', {
  number: Schema.Int,
  reason: Schema.Literals(['source', 'shape', 'cuts']),
}) {}

const changesOf = (changes: Syllable['guitar']) =>
  (changes ?? []).map(({ chord, at }) => ({
    root: chord.root,
    quality: Chord.Quality.literals.indexOf(chord.quality),
    bass: chord.bass ?? -1,
    at,
  }));

const numericPart = (part: Part): typeof NumericPart.Type => ({
  level: part._tag === 'Plain' ? 0 : part.level === 'line' ? 1 : 2,
  why: part.why.map((why) => Reason.literals.indexOf(why)),
  fit:
    part.fit === undefined
      ? []
      : [
          part.fit.notes,
          part.fit.syllables,
          part.fit.melismas,
          part.fit.shared.inWord,
          part.fit.shared.acrossWords,
          part.fit.cost,
        ],
  lines:
    part._tag === 'Plain'
      ? part.lines.map(() => [])
      : part.lines.map((line) => {
          let offset = 0;
          return line.map((s, i) => {
            if (i === 0 || line[i - 1]?.word !== s.word) offset = 0;
            const cut = {
              word: s.word,
              offset,
              length: s.text.length,
              notes: s.notes,
              beats: s.beats,
              full: changesOf(s.full),
              guitar: changesOf(s.guitar),
            };
            offset += s.text.length;
            return cut;
          });
        }),
});

/** Never serializes a hymn's text, title, or MIDI track names. */
export const metadataOf = (hymn: Hymn, sourceHash: string) =>
  Effect.gen(function* () {
    if (hymn.timing === undefined)
      return yield* PlaybackMismatch.make({ number: hymn.number, reason: 'shape' });
    return yield* Schema.decodeEffect(Playback)({
      version: 1,
      number: hymn.number,
      sourceHash,
      timing: hymn.timing,
      verses: hymn.verses,
      stanzas: hymn.stanzas.map(numericPart),
      refrain: hymn.refrain === undefined ? [] : [numericPart(hymn.refrain.part)],
    }).pipe(Effect.mapError(() => PlaybackMismatch.make({ number: hymn.number, reason: 'shape' })));
  });

const wordsOf = (part: Part, line: number): readonly string[] => {
  if (part._tag === 'Plain') return (part.lines[line] ?? '').trim().split(/\s+/);
  const words: string[] = [];
  for (const s of part.lines[line] ?? []) words[s.word] = (words[s.word] ?? '') + s.text;
  return words;
};

const decodeChanges = (changes: readonly (typeof Change.Type)[]) =>
  changes.map((c) => {
    const chord: Mutable<Chord.Chord> = {
      root: c.root,
      quality: Chord.Quality.literals[c.quality] ?? '',
    };
    if (c.bass >= 0) chord.bass = c.bass;
    return { chord, at: c.at };
  });

/** Join only after schema decoding and input fingerprint validation. */
export const applyMetadata = (
  hymn: Hymn,
  metadata: Playback,
  sourceHash: string,
): Effect.Effect<Hymn, PlaybackMismatch> =>
  Effect.gen(function* () {
    const refuse = (reason: PlaybackMismatch['reason']) =>
      PlaybackMismatch.make({ number: hymn.number, reason });
    if (
      metadata.version !== 1 ||
      metadata.number !== hymn.number ||
      metadata.sourceHash !== sourceHash
    )
      return yield* refuse('source');
    if (
      metadata.stanzas.length !== hymn.stanzas.length ||
      metadata.refrain.length !== Number(hymn.refrain !== undefined)
    )
      return yield* refuse('shape');
    const partOf = (
      part: Part,
      numeric: typeof NumericPart.Type,
    ): Effect.Effect<Part, PlaybackMismatch> =>
      Effect.gen(function* () {
        if (numeric.lines.length !== part.lines.length) return yield* refuse('shape');
        const why = numeric.why.map((n) => Reason.literals[n] ?? 'notes');
        const [notes, syllables, melismas, inWord, acrossWords, cost] = numeric.fit;
        const fit =
          notes === undefined ||
          syllables === undefined ||
          melismas === undefined ||
          inWord === undefined ||
          acrossWords === undefined ||
          cost === undefined
            ? undefined
            : { notes, syllables, melismas, shared: { inWord, acrossWords }, cost };
        if (numeric.level === 0) {
          const lines =
            part._tag === 'Plain'
              ? [...part.lines]
              : part.lines.map((_, l) => wordsOf(part, l).join(' '));
          if (!Arr.isArrayNonEmpty(lines) || !Arr.isArrayNonEmpty(why))
            return yield* refuse('shape');
          const plain: Mutable<Plain> = { _tag: 'Plain', lines, why };
          if (fit !== undefined) plain.fit = fit;
          return plain;
        }
        const lines = yield* Effect.forEach(numeric.lines, (line, l) =>
          Effect.gen(function* () {
            const words = wordsOf(part, l);
            const used = words.map(() => 0);
            const syllables = yield* Effect.forEach(line, (cut) =>
              Effect.gen(function* () {
                const word = words[cut.word];
                if (
                  word === undefined ||
                  cut.offset !== used[cut.word] ||
                  cut.offset + cut.length > word.length
                )
                  return yield* refuse('cuts');
                used[cut.word] = cut.offset + cut.length;
                const full = decodeChanges(cut.full),
                  guitar = decodeChanges(cut.guitar);
                const syllable: Mutable<Syllable> = {
                  text: word.slice(cut.offset, cut.offset + cut.length),
                  word: cut.word,
                  notes: cut.notes,
                  beats: cut.beats,
                };
                if (Arr.isArrayNonEmpty(full)) syllable.full = full;
                if (Arr.isArrayNonEmpty(guitar)) syllable.guitar = guitar;
                return syllable;
              }),
            );
            if (words.some((word, i) => used[i] !== word.length) || !Arr.isArrayNonEmpty(syllables))
              return yield* refuse('cuts');
            return syllables;
          }),
        );
        if (!Arr.isArrayNonEmpty(lines) || fit === undefined) return yield* refuse('shape');
        return { _tag: 'Sung', level: numeric.level === 1 ? 'line' : 'syllable', lines, fit, why };
      });
    const stanzas = yield* Effect.forEach(hymn.stanzas, (part, i) => {
      const numeric = metadata.stanzas[i];
      return numeric === undefined ? Effect.fail(refuse('shape')) : partOf(part, numeric);
    });
    if (!Arr.isArrayNonEmpty(stanzas)) return yield* refuse('shape');
    const numericRefrain = metadata.refrain[0];
    const refrain =
      hymn.refrain === undefined || numericRefrain === undefined
        ? undefined
        : {
            order: hymn.refrain.order,
            part: yield* partOf(hymn.refrain.part, numericRefrain),
          };
    const joined: Mutable<Hymn> = {
      ...hymn,
      stanzas,
      verses: metadata.verses,
      timing: metadata.timing,
    };
    if (refrain !== undefined) joined.refrain = refrain;
    return joined;
  });
