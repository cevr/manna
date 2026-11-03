import type { Pcm } from './audio.ts';
import { Heard, type HeardWord, type TakeWord, type Voiced, type Word } from './schema.ts';
import { toMs } from './time.ts';

const VOICE_GATE_DB = -40;
const VOICE_WINDOW = 0.01;

const GATE = 10 ** (VOICE_GATE_DB / 10);

export const voicedAt = (start: number, end: number): Voiced => ({
  start: Heard.make(start),
  end: Heard.make(end),
});

const meanSquare = (pcm: Pcm, from: number, to: number): number => {
  let sum = 0;
  let n = 0;
  for (const plane of pcm.channels)
    for (let i = from; i < to; i++) {
      const x = plane[i] ?? 0;
      sum += x * x;
      n++;
    }
  return sum / Math.max(1, n);
};

export const voicedSpan = (pcm: Pcm, start: number, end: number): Voiced => {
  const step = Math.max(1, Math.round(VOICE_WINDOW * pcm.rate));
  const from = Math.max(0, Math.round(start * pcm.rate));
  const to = Math.min(pcm.frames, Math.round(end * pcm.rate));
  let first = -1;
  let last = -1;
  for (let a = from; a < to; a += step) {
    const b = Math.min(to, a + step);
    if (meanSquare(pcm, a, b) <= GATE) continue;
    if (first < 0) first = a;
    last = b;
  }
  if (first < 0) return voicedAt(end, end);
  const on = Math.min(end, Math.max(start, toMs(first / pcm.rate)));
  return voicedAt(on, Math.min(end, Math.max(on, toMs(last / pcm.rate))));
};

export const voicedWords = (words: ReadonlyArray<Word>, pcm: Pcm): Array<TakeWord> =>
  words.map((w) => ({
    text: w.text,
    start: w.start,
    end: w.end,
    voiced: voicedSpan(pcm, w.start, w.end),
  }));

export const unmeasured = (words: ReadonlyArray<Word>): Array<TakeWord> =>
  words.map((w) => ({ ...w, voiced: voicedAt(w.start, w.end) }));

export const heard = (words: ReadonlyArray<TakeWord>): Array<HeardWord> =>
  words.map((w) => ({ text: w.text, start: w.voiced.start, end: w.voiced.end }));
