import * as Chord from './chord.js';
import type { Note } from './midi.js';
import type { Score } from './score.js';

export interface Span {
  readonly start: number;
  readonly end: number;
  readonly chord: Chord.Chord;
}

export type Level = 'full' | 'guitar';

const tonicOf = (score: Score) => Chord.pitchClass(score.key.tonic);

interface Sampled extends Span {
  readonly pedal: boolean;
}

const sample = (score: Score, from: number, to: number): Sampled[] => {
  const near = score.harmony.filter((note) => note.start < to && note.end > from);
  const onsets = [
    ...new Set([from, ...near.map((n) => n.start).filter((t) => t > from && t < to)]),
  ].sort((a, b) => a - b);
  const spans: Sampled[] = [];
  onsets.forEach((tick, i) => {
    const sounding = near.filter((note) => note.start <= tick && note.end > tick);
    const end = onsets[i + 1] ?? to;
    if (sounding.length === 0) return;
    const last = spans.at(-1);
    const keys = sounding.map((note) => note.key);
    const tonic = tonicOf(score);
    const own = Chord.fromPitches(keys, Math.min(...keys), tonic);
    const over = own === undefined ? Chord.overBass(keys, tonic) : undefined;
    const chord = own ?? over ?? Chord.withoutOne(keys, tonic, last?.chord);
    if (chord === undefined) {
      if (last !== undefined) spans[spans.length - 1] = { ...last, end };
      return;
    }
    spans.push({ start: tick, end, chord, pedal: over !== undefined });
  });
  return spans;
};

const merge = <S extends Span>(spans: readonly S[]): S[] =>
  spans.reduce<S[]>((out, span) => {
    const last = out.at(-1);
    if (last !== undefined && Chord.equals(last.chord, span.chord)) {
      out[out.length - 1] = { ...last, end: span.end };
    } else out.push(span);
    return out;
  }, []);

const dropPedals = (spans: readonly Sampled[]): Span[] => {
  const out: Sampled[] = [];
  spans.forEach((span, i) => {
    const [before, after] = [out.at(-1), spans[i + 1]];
    const neighbor =
      span.pedal &&
      before !== undefined &&
      after !== undefined &&
      Chord.equals(before.chord, after.chord);
    if (neighbor) out[out.length - 1] = { ...before, end: span.end };
    else out.push(span);
  });
  return out;
};

const dropShort = (spans: readonly Span[], min: number): Span[] => {
  const out: Span[] = [];
  for (const span of spans) {
    const last = out.at(-1);
    if (span.end - span.start >= min || last === undefined) out.push(span);
    else out[out.length - 1] = { ...last, end: span.end };
  }
  const [first, second] = out;
  if (first !== undefined && second !== undefined && first.end - first.start < min) {
    out.splice(0, 2, { ...second, start: first.start });
  }
  return merge(out);
};

const dropNeighbors = (spans: readonly Span[], beat: number): Span[] => {
  const out = [...spans];
  for (let i = 1; i < out.length - 1; i++) {
    const [before, here, after] = [out[i - 1], out[i], out[i + 1]];
    if (before === undefined || here === undefined || after === undefined) continue;
    if (here.end - here.start < beat && Chord.equals(before.chord, after.chord)) {
      out.splice(i - 1, 3, { ...before, end: after.end });
      i -= 1;
    }
  }
  return out;
};

const mod12 = (n: number) => ((n % 12) + 12) % 12;

const readSixths = (spans: readonly Span[]): Span[] =>
  spans.map((span, i) => {
    const { root, quality, bass } = span.chord;
    const seventh = quality === '6' ? 'm7' : quality === 'm6' ? 'm7b5' : undefined;
    if (seventh === undefined || bass !== undefined) return span;
    const below = mod12(root - 3);
    const next = spans[i + 1]?.chord;
    const held = spans[i - 1]?.chord.root === root;
    if (next === undefined || mod12(next.root - below) !== 5 || held) return span;
    return { ...span, chord: { root: below, quality: seventh, bass: root } };
  });

export const chords = (score: Score, from: number, to: number, level: Level): Span[] => {
  const beat = score.ticksPerBeat;
  const full = merge(
    readSixths(dropShort(merge(dropPedals(merge(sample(score, from, to)))), beat / 2)),
  );
  if (level === 'full') return full;
  const strummed = full.map((span) => ({ ...span, chord: Chord.simplify(span.chord) }));
  return dropShort(dropNeighbors(merge(strummed), beat), beat / 2);
};

export interface Change {
  readonly offset: number;
  readonly chord: Chord.Chord;
}

export const onNotes = (
  score: Score,
  from: number,
  to: number,
  level: Level,
): ReadonlyArray<{ readonly note: Note; readonly changes: readonly Change[] }> => {
  const spans = chords(score, from, to, level);
  const notes = score.melody.filter((note) => note.start >= from && note.start < to);
  return notes.map((note, i) => {
    const next = notes[i + 1]?.start ?? to;
    const changes = spans
      .filter((span) => span.start >= note.start && span.start < next)
      .map((span) => ({ offset: span.start - note.start, chord: span.chord }));
    if (i === 0 && changes[0]?.offset !== 0) {
      const sounding = spans.find((span) => span.start <= note.start && span.end > note.start);
      if (sounding !== undefined) changes.unshift({ offset: 0, chord: sounding.chord });
    }
    return { note, changes };
  });
};
