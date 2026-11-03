import type { Midi, Note, Track } from './midi.js';

const KEYBOARDS = [5, 4];

export const harmonyTracks = (midi: Midi): readonly Track[] => {
  const sounding = midi.tracks.filter((track) => track.notes.length > 0);
  for (const program of KEYBOARDS) {
    const tracks = sounding.filter((track) => track.program === program);
    if (tracks.length > 0) return tracks.slice(0, 4);
  }
  return sounding.slice(0, 4);
};

export const topVoice = (notes: readonly Note[], slack: number): Note[] => {
  const onsets: number[][] = [];
  for (const tick of [...new Set(notes.map((note) => note.start))].sort((a, b) => a - b)) {
    const last = onsets.at(-1);
    if (last !== undefined && tick - (last[0] ?? tick) <= slack) last.push(tick);
    else onsets.push([tick]);
  }
  const melody: Note[] = [];
  for (const ticks of onsets) {
    const tick = ticks[0] ?? 0;
    const starting = notes.filter((note) => ticks.includes(note.start));
    const highest = starting.reduce((a, b) =>
      b.key > a.key || (b.key === a.key && b.end - b.start < a.end - a.start) ? b : a,
    );
    const above = notes.some(
      (note) => note.start < tick && note.end > tick + slack && note.key > highest.key,
    );
    if (!above) melody.push(highest);
  }
  return melody;
};

export const melodyOf = (midi: Midi, harmony: readonly Track[]): Note[] => {
  const first = midi.tracks.find((track) => track.notes.length > 0);
  const slack = midi.ticksPerBeat / 16;
  const single = !first?.notes.some((note, i, notes) =>
    notes.some(
      (other, j) => j < i && Math.abs(note.start - other.start) <= slack && note.key !== other.key,
    ),
  );
  const own = first !== undefined && !harmony.includes(first) && single ? first : harmony[0];
  return own === undefined ? [] : topVoice(own.notes, midi.ticksPerBeat / 16);
};
