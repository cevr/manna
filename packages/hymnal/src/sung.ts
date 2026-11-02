/**
 * The file as it is sung: a hymn's MIDI file with a verse for each of its
 * text's stanzas. The compiler times the hymn on it (`compile.ts`) and the
 * render records it (`scripts/render/run.ts`), so a recording and its timing
 * come from one file.
 *
 * A file whose read (`Score.fromMidi`) plays as many verses as the text has
 * stanzas, or more, is sung as it stands. A file that plays fewer sings its
 * last verse again for each stanza past them: each pass runs from the last
 * verse's start to the file's end (its silent tail included, so no note
 * crosses into the next pass), and the tempo, meter and key in effect at the
 * verse's start are stated again at each later pass's start, so each pass
 * plays as long as the verse does. Events at the file's very end move to the
 * sung file's end.
 *
 * Pure: no file, Bun or Node access.
 */

import type { Midi, Note } from './midi.js';
import * as Score from './score.js';

/** A file with no tempo event plays at 120 quarter notes a minute (`midi.ts`). */
const DEFAULT_TEMPO = 500_000;

/** Where a file's last verse is sung again. */
export interface Loop {
  /** The last verse's start, in ticks: the first pass's start. */
  readonly start: number;
  /** A pass, in ticks: the last verse's start to the file's end. */
  readonly length: number;
  /** How many times the last verse is sung: once, and once more for each stanza past the file's verses. */
  readonly passes: number;
}

export interface Sung {
  /** The file as it is sung: the input itself when it is sung as it stands. */
  readonly midi: Midi;
  /** The sung file read, a verse for each stanza; its `exact` is the file's own read's. */
  readonly score: Score.Score;
  /** The verses the file itself plays: its read's count. */
  readonly played: number;
  /** The loop, when the file plays fewer verses than the text has stanzas. */
  readonly loop: Loop | undefined;
}

const byStart = (notes: ReadonlyArray<Note>) =>
  [...notes].sort((a, b) => a.start - b.start || a.key - b.key);

/** A hymn's file as it is sung by a text of `stanzas` stanzas. */
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
  /** A tempo, meter or key list sung through: the verse's events each pass, its opening state stated again. */
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
