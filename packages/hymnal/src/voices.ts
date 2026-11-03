import type { Midi, Note } from './midi.js';
import { harmonyTracks, melodyOf, topVoice } from './melody.js';

export interface Voices {
  readonly S: readonly Note[];
  readonly A: readonly Note[];
  readonly T: readonly Note[];
  readonly B: readonly Note[];
}

const bottomVoice = (notes: readonly Note[], slack: number): Note[] =>
  topVoice(
    notes.map((note) => ({ ...note, key: -note.key })),
    slack,
  ).map((note) => ({ ...note, key: -note.key }));

const onsetKey = (note: Note) => `${note.start}:${note.key}`;
const noteKey = (note: Note) => `${note.start}:${note.end}:${note.key}`;

const byStartEndKey = (a: Note, b: Note) => a.start - b.start || a.end - b.end || a.key - b.key;

export const voices = (midi: Midi): Voices => {
  const harmony = harmonyTracks(midi);
  const last = harmony.at(-1);
  if (last === undefined) return { S: [], A: [], T: [], B: [] };
  const first = midi.tracks.find((track) => track.notes.length > 0);
  const own = first !== undefined && !harmony.includes(first) ? first : harmony[0];
  const melody = melodyOf(midi, harmony);
  const sung = new Set(melody.map(onsetKey));
  const bass = bottomVoice(last.notes, midi.ticksPerBeat / 16);
  const bassNotes = new Set(bass.map(noteKey));
  const half = harmony.length > 2 ? Math.floor((harmony.length + 1) / 2) : 1;
  const upper: Note[] = [];
  const lower: Note[] = [];
  for (const [i, track] of harmony.entries()) {
    for (const note of track.notes) {
      if (track === own && sung.has(onsetKey(note))) continue;
      if (track === last && bassNotes.has(noteKey(note))) continue;
      (i < half ? upper : lower).push(note);
    }
  }
  return {
    S: melody,
    A: upper.filter((note) => !sung.has(onsetKey(note))).sort(byStartEndKey),
    T: lower.sort(byStartEndKey),
    B: bass,
  };
};
