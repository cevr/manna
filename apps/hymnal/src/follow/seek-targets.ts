import { Array as Arr, Option } from 'effect';

import type { HymnText } from '../hymns/text';
import { type Choice, chosenOf, countOf, cutOf, keptOf } from '../player/stanzas';
import type { TimedLine, Timeline } from './timeline';

export type SeekTarget =
  | { readonly _tag: 'Line'; readonly line: number; readonly ms: number }
  | { readonly _tag: 'Word'; readonly line: number; readonly word: number; readonly ms: number };

export interface WordOnset {
  readonly word: number;
  readonly ms: number;
  /** All word ordinals sharing this onset, including this word. */
  readonly shared: ReadonlyArray<number>;
}

interface LineSpan {
  readonly line: number;
  readonly start: number;
  readonly until: number;
}

export type SeekLine =
  | (LineSpan & { readonly _tag: 'LineOnly' })
  | (LineSpan & { readonly _tag: 'WordTimed'; readonly words: ReadonlyArray<WordOnset> });

export interface SeekTargets {
  readonly number: number;
  /** Normalized stanza choice; every stanza is represented by []. */
  readonly choice: Choice;
  readonly lines: ReadonlyArray<SeekLine>;
}

const wordCount = (text: string): number =>
  text.split(/\s+/u).filter((segment) => /[\p{L}\p{N}]/u.test(segment)).length;

const validTimes = (line: TimedLine, count: number): boolean => {
  if (line.syllables.length !== line.words.length) return false;
  if (line.syllables.length === 0) return true;
  let time = line.start;
  let word = 0;
  for (const [index, onset] of line.syllables.entries()) {
    const ordinal = Arr.getUnsafe(line.words, index);
    if (
      !Number.isFinite(onset) ||
      onset < time ||
      onset >= line.until ||
      !Number.isInteger(ordinal) ||
      ordinal < word ||
      ordinal > word + 1 ||
      (index === 0 && ordinal !== 0)
    )
      return false;
    time = onset;
    word = ordinal;
  }
  return word + 1 === count;
};

const validGeometry = (timeline: Timeline): boolean => {
  if (
    !Number.isFinite(timeline.first) ||
    timeline.first < 0 ||
    !Number.isFinite(timeline.end) ||
    timeline.end < timeline.first ||
    timeline.lines[0]?.start !== timeline.first ||
    timeline.lines.at(-1)?.until !== timeline.end
  )
    return false;
  let until = timeline.first;
  for (const line of timeline.lines) {
    if (
      !Number.isFinite(line.start) ||
      !Number.isFinite(line.until) ||
      line.start < until ||
      line.until < line.start
    )
      return false;
    until = line.until;
  }
  return true;
};

const projected = (line: TimedLine, index: number): SeekLine => {
  const span = { line: index, start: line.start, until: line.until };
  if (!line.played || line.even || line.syllables.length === 0)
    return { ...span, _tag: 'LineOnly' };
  const onsets: Array<{ word: number; ms: number }> = [];
  for (const [index, ms] of line.syllables.entries()) {
    const word = Arr.getUnsafe(line.words, index);
    if (onsets.at(-1)?.word !== word) onsets.push({ word, ms });
  }
  return {
    ...span,
    _tag: 'WordTimed',
    words: onsets.map((onset) => ({
      ...onset,
      shared: onsets.filter(({ ms }) => ms === onset.ms).map(({ word }) => word),
    })),
  };
};

/** Projects an uncut score once, preserving displayed logical-line occurrence identities. */
export const targetsOf = (
  hymn: HymnText,
  timeline: Timeline,
  choice: Choice,
): Option.Option<SeekTargets> => {
  const text = hymn.sections.flatMap((section) => section.lines);
  if (text.length !== timeline.lines.length || !validGeometry(timeline)) return Option.none();
  const counts = text.map(wordCount);
  if (!timeline.lines.every((line, index) => validTimes(line, counts[index] ?? 0)))
    return Option.none();
  const kept = keptOf(hymn.sections, choice);
  const cut = cutOf(timeline, kept).timeline;
  const lines = cut.lines.flatMap((line, index) => {
    if (!kept[index] || line.until === line.start || counts[index] === 0) return [];
    return [projected(line, index)];
  });
  if (lines.length === 0) return Option.none();
  const chosen = [...new Set(chosenOf(choice, countOf(hymn.sections)))].toSorted((a, b) => a - b);
  let normalized: Choice = chosen;
  if (chosen.length === countOf(hymn.sections)) normalized = [];
  return Option.some({ number: hymn.number, choice: normalized, lines });
};

/** Resolves only an exact eligible occurrence and trusted compiled word ordinal. */
export const targetAt = (
  targets: SeekTargets,
  lineIndex: number,
  word: Option.Option<number>,
): Option.Option<SeekTarget> =>
  Option.gen(function* () {
    if (!Number.isInteger(lineIndex) || lineIndex < 0) return yield* Option.none();
    const line = yield* Arr.findFirst(targets.lines, (line) => line.line === lineIndex);
    if (Option.isNone(word)) return { _tag: 'Line', line: line.line, ms: line.start };
    if (!Number.isInteger(word.value) || word.value < 0 || line._tag !== 'WordTimed')
      return yield* Option.none();
    const onset = yield* Arr.findFirst(line.words, (onset) => onset.word === word.value);
    return { _tag: 'Word', line: line.line, word: onset.word, ms: onset.ms };
  });

/** Anchors intro/tail to the nearest eligible occurrence, with last-at-or-before shared times. */
export const initialTarget = (targets: SeekTargets, sungMs: number): Option.Option<SeekTarget> =>
  Option.gen(function* () {
    if (!Number.isFinite(sungMs) || sungMs < 0) return yield* Option.none();
    const line = yield* Arr.findLast(targets.lines, (line) => line.start <= sungMs).pipe(
      Option.orElse(() => Arr.head(targets.lines)),
    );
    if (line._tag === 'LineOnly') return yield* targetAt(targets, line.line, Option.none());
    const onset = yield* Arr.findLast(line.words, ({ ms }) => ms <= sungMs).pipe(
      Option.orElse(() => Arr.head(line.words)),
    );
    return yield* targetAt(targets, line.line, Option.some(onset.word));
  });
