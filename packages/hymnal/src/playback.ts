/** Numeric playback metadata. Words stay in the read-only corpus; cuts are
 * offsets into its words. Timing and chords come from one fresh compilation.
 * Each sidecar carries its own MIDI/corpus digest. The build manifest owns
 * global compiler provenance.
 */
import { Array as Arr, Effect, Result, Schema } from 'effect';
import type { Mutable } from 'effect/Types';
import * as Chord from './chord.js';
import { type Hymn, type Part, type Plain, type Syllable, Reason, Timing, sung } from './hymn.js';

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
const CompactChange = Schema.Tuple([
  Chord.Degree,
  Quality,
  Schema.Int.check(Schema.isBetween({ minimum: -1, maximum: 11 })),
  Schema.Finite,
]);
/** Part index (refrain follows stanzas), line, syllable, replacement changes. */
export const PlacementPatch = Schema.Tuple([Count, Count, Count, Schema.Array(CompactChange)]);
export type PlacementPatch = typeof PlacementPatch.Type;
export const Placements = Schema.Struct({
  file: Schema.Array(PlacementPatch),
  simpler: Schema.Array(PlacementPatch),
});
export type Placements = typeof Placements.Type;
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
  fit: Schema.Union([
    Schema.Tuple([]),
    Schema.Tuple([Count, Count, Count, Count, Count, Schema.Finite]),
  ]),
});
export const Playback = Schema.Struct({
  version: Schema.Literal(1),
  number: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 695 })),
  sourceHash: Schema.String,
  timing: Timing,
  verses: Schema.Struct({ text: Count, midi: Count, exact: Schema.Boolean }),
  stanzas: Schema.Array(NumericPart),
  refrain: Schema.Array(NumericPart),
  placements: Schema.optionalKey(Placements),
});
export type Playback = typeof Playback.Type;

class PlaybackMismatch extends Schema.TaggedError<PlaybackMismatch>()('PlaybackMismatch', {
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

/** Only changed numeric guitar anchors are stored; words and timing occur once. */
export const placementPatches = (base: Hymn, other: Hymn): readonly PlacementPatch[] => {
  const parts = (hymn: Hymn) => [
    ...hymn.stanzas,
    ...(hymn.refrain === undefined ? [] : [hymn.refrain.part]),
  ];
  const to = parts(other);
  return parts(base).flatMap((part, p) =>
    part._tag === 'Plain'
      ? []
      : part.lines.flatMap((line, l) =>
          line.flatMap((s, k): PlacementPatch[] => {
            const next = to[p];
            if (next?._tag !== 'Sung') return [];
            const changes = changesOf(next.lines[l]?.[k]?.guitar);
            const previous = changesOf(s.guitar);
            if (
              previous.length === changes.length &&
              previous.every((c, i) => {
                const other = changes[i];
                return (
                  other !== undefined &&
                  c.root === other.root &&
                  c.quality === other.quality &&
                  c.bass === other.bass &&
                  c.at === other.at
                );
              })
            )
              return [];
            return [[p, l, k, changes.map((c) => [c.root, c.quality, c.bass, c.at])]];
          }),
        ),
  );
};

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
      quality: Arr.getUnsafe(Chord.Quality.literals, c.quality),
    };
    if (c.bass >= 0) chord.bass = c.bass;
    return { chord, at: c.at };
  });

const consistentTiming = (hymn: Hymn): boolean => {
  const timing = hymn.timing;
  if (timing === undefined) return false;
  const lines = sung(hymn);
  if (timing.lines.length !== lines.length) return false;
  return lines.every((line, i) => {
    const at = timing.lines[i];
    if (at === undefined) return false;
    if (line.part._tag === 'Plain') return at.even && at.syllables.length === 0;
    return at.syllables.length === line.part.lines[line.line]?.length;
  });
};

const fitOf = (values: (typeof NumericPart.Type)['fit']) => {
  if (values.length === 0) return undefined;
  const [notes, syllables, melismas, inWord, acrossWords, cost] = values;
  return { notes, syllables, melismas, shared: { inWord, acrossWords }, cost };
};

const lineOf = (
  words: readonly string[],
  line: readonly (typeof Cut.Type)[],
  refuse: () => PlaybackMismatch,
): Result.Result<[Syllable, ...Syllable[]], PlaybackMismatch> => {
  const used = words.map(() => 0);
  const syllables: Syllable[] = [];
  for (const cut of line) {
    const word = words[cut.word];
    if (
      word === undefined ||
      cut.offset !== used[cut.word] ||
      cut.offset + cut.length > word.length
    )
      return Result.fail(refuse());
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
    syllables.push(syllable);
  }
  return words.some((word, i) => used[i] !== word.length) || !Arr.isArrayNonEmpty(syllables)
    ? Result.fail(refuse())
    : Result.succeed(syllables);
};

/** Join decoded numeric cuts in plain loops; one typed failure boundary. */
export const applyMetadata = (
  hymn: Hymn,
  metadata: Playback,
  sourceHash: string,
): Effect.Effect<Hymn, PlaybackMismatch> =>
  Effect.suspend(() => {
    const refuse = (reason: PlaybackMismatch['reason']) =>
      PlaybackMismatch.make({ number: hymn.number, reason });
    if (
      metadata.version !== 1 ||
      metadata.number !== hymn.number ||
      metadata.sourceHash !== sourceHash
    )
      return Effect.fail(refuse('source'));
    if (
      metadata.stanzas.length !== hymn.stanzas.length ||
      metadata.refrain.length !== Number(hymn.refrain !== undefined)
    )
      return Effect.fail(refuse('shape'));
    const partOf = (
      part: Part,
      numeric: typeof NumericPart.Type,
    ): Result.Result<Part, PlaybackMismatch> => {
      if (numeric.lines.length !== part.lines.length) return Result.fail(refuse('shape'));
      const why = numeric.why.map((n) => Arr.getUnsafe(Reason.literals, n));
      const fit = fitOf(numeric.fit);
      if (numeric.level === 0) {
        const lines =
          part._tag === 'Plain'
            ? [...part.lines]
            : part.lines.map((_, l) => wordsOf(part, l).join(' '));
        if (!Arr.isArrayNonEmpty(lines) || !Arr.isArrayNonEmpty(why))
          return Result.fail(refuse('shape'));
        const plain: Mutable<Plain> = { _tag: 'Plain', lines, why };
        if (fit !== undefined) plain.fit = fit;
        return Result.succeed(plain);
      }
      const lines: Array<[Syllable, ...Syllable[]]> = [];
      for (const [l, line] of numeric.lines.entries()) {
        const decoded = lineOf(wordsOf(part, l), line, () => refuse('cuts'));
        if (Result.isFailure(decoded)) return Result.fail(decoded.failure);
        lines.push(decoded.success);
      }
      if (!Arr.isArrayNonEmpty(lines) || fit === undefined) return Result.fail(refuse('shape'));
      return Result.succeed({
        _tag: 'Sung',
        level: numeric.level === 1 ? 'line' : 'syllable',
        lines,
        fit,
        why,
      });
    };
    const stanzas: Part[] = [];
    for (const [i, part] of hymn.stanzas.entries()) {
      const numeric = metadata.stanzas[i];
      if (numeric === undefined) return Effect.fail(refuse('shape'));
      const result = partOf(part, numeric);
      if (Result.isFailure(result)) return Effect.fail(result.failure);
      stanzas.push(result.success);
    }
    if (!Arr.isArrayNonEmpty(stanzas)) return Effect.fail(refuse('shape'));
    const numericRefrain = metadata.refrain[0];
    let refrain: Hymn['refrain'];
    if (hymn.refrain !== undefined && numericRefrain !== undefined) {
      const result = partOf(hymn.refrain.part, numericRefrain);
      if (Result.isFailure(result)) return Effect.fail(result.failure);
      refrain = { order: hymn.refrain.order, part: result.success };
    }
    const joined: Mutable<Hymn> = {
      ...hymn,
      stanzas,
      verses: metadata.verses,
      timing: metadata.timing,
    };
    if (refrain !== undefined) joined.refrain = refrain;
    if (!consistentTiming(joined)) return Effect.fail(refuse('shape'));
    return Effect.succeed(joined);
  });
