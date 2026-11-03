import type { Midi, Note } from './midi.js';
import * as Score from './score.js';

const DEFAULT_TEMPO = 500_000;

export interface Loop {
  readonly start: number;
  readonly length: number;
  readonly passes: number;
}

export interface Sung {
  readonly midi: Midi;
  readonly score: Score.Score;
  readonly played: number;
  readonly loop: Loop | undefined;
}

const byStart = (notes: ReadonlyArray<Note>) =>
  [...notes].sort((a, b) => a.start - b.start || a.key - b.key);

export const of = (midi: Midi, stanzas: number): Sung => {
  const read = Score.fromMidi(midi, stanzas);
  const spans = read.verses.spans;
  const played = spans.length;
  const last = spans.at(-1);
  if (played >= stanzas || last === undefined)
    return { midi, score: read, played, loop: undefined };
  const start = last.start;
  const length = midi.lastTick - start;
  const more = stanzas - played;
  const passes = Array.from({ length: more + 1 }, (_, j) => j * length);
  const tracks = midi.tracks.map((track) => {
    const verse = track.notes.filter((note) => note.start >= start);
    const copies = passes.flatMap((shift) =>
      verse.map((note) => ({ ...note, start: note.start + shift, end: note.end + shift })),
    );
    return { ...track, notes: byStart([...track.notes.filter((n) => n.start < start), ...copies]) };
  });
  const sungEvents = <E extends { readonly tick: number }>(
    events: ReadonlyArray<E>,
    none: E | undefined,
  ): E[] => {
    const verse = events.filter((e) => e.tick >= start && e.tick < midi.lastTick);
    const opening = verse.some((e) => e.tick === start)
      ? undefined
      : (events.findLast((e) => e.tick <= start) ?? none);
    return [
      ...events.filter((e) => e.tick < start),
      ...passes.flatMap((shift) => [
        ...(shift === 0 || opening === undefined ? [] : [{ ...opening, tick: start + shift }]),
        ...verse.map((e) => ({ ...e, tick: e.tick + shift })),
      ]),
      ...events
        .filter((e) => e.tick >= midi.lastTick)
        .map((e) => ({ ...e, tick: e.tick + more * length })),
    ];
  };
  const out: Midi = {
    ...midi,
    tracks,
    tempos: sungEvents(midi.tempos, { tick: 0, microsPerQuarter: DEFAULT_TEMPO }),
    timeSignatures: sungEvents(midi.timeSignatures, undefined),
    keySignatures: sungEvents(midi.keySignatures, undefined),
    lastTick: midi.lastTick + more * length,
  };
  const sungSpans = [
    ...spans.slice(0, -1),
    ...passes.slice(0, -1).map((shift) => ({ start: start + shift, end: start + shift + length })),
    { start: start + more * length, end: last.end + more * length },
  ];
  return {
    midi: out,
    score: {
      ...Score.fromMidi(out, stanzas),
      verses: { spans: sungSpans, exact: read.verses.exact },
    },
    played,
    loop: { start, length, passes: passes.length },
  };
};
