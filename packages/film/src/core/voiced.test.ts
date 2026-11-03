import { describe, expect, test } from 'bun:test';
import type { Pcm } from './audio.ts';
import type { HeardWord, TakeWord, Voiced } from './schema.ts';
import { heard, unmeasured, voicedAt, voicedSpan, voicedWords } from './voiced.ts';

const RATE = 8000;

const take = (seconds: number, loud: ReadonlyArray<readonly [number, number]>): Pcm => {
  const frames = Math.round(seconds * RATE);
  const plane = new Float32Array(frames);
  for (const [from, to] of loud)
    for (let i = Math.round(from * RATE); i < Math.round(to * RATE); i++)
      plane[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / RATE);
  return { rate: RATE, frames, channels: [plane, plane] };
};

describe('voicedSpan', () => {
  test('the pause the aligner put inside a word is not its voice', () => {
    const pcm = take(2.5, [[0.87, 1.9]]);
    expect(voicedSpan(pcm, 0, 2.3)).toEqual(voicedAt(0.87, 1.9));
  });

  test('the voice is read inside the span only: a neighbour heard outside it does not count', () => {
    const pcm = take(2, [
      [0.1, 0.5],
      [1.2, 1.6],
    ]);
    expect(voicedSpan(pcm, 0.5, 1.4)).toEqual(voicedAt(1.2, 1.4));
  });

  test('a word no window of which passes the gate is heard no sooner than its span ends', () => {
    const pcm = take(1.5, [[1.1, 1.4]]);
    expect(voicedSpan(pcm, 0.48, 1.08)).toEqual(voicedAt(1.08, 1.08));
    expect(voicedSpan(take(1, []), 0.2, 0.6)).toEqual(voicedAt(0.6, 0.6));
  });

  test('a voice under −40 dBFS is silence', () => {
    const quiet: Pcm = {
      rate: RATE,
      frames: RATE,
      channels: [
        Float32Array.from({ length: RATE }, (_, i) => 0.008 + Number(i > RATE / 2) * 0.292),
      ],
    };
    expect<number>(voicedSpan(quiet, 0, 1).start).toBe(0.5);
  });
});

describe('voicedWords and heard', () => {
  test("each word keeps its aligned span and carries its voice's; heard times it by the voice", () => {
    const pcm = take(2, [
      [0.4, 0.8],
      [1.3, 1.7],
    ]);
    const words = voicedWords(
      [
        { text: 'Paul', start: 0, end: 0.8 },
        { text: 'says', start: 0.8, end: 1.8 },
      ],
      pcm,
    );
    expect(words).toEqual([
      { text: 'Paul', start: 0, end: 0.8, voiced: voicedAt(0.4, 0.8) },
      { text: 'says', start: 0.8, end: 1.8, voiced: voicedAt(1.3, 1.7) },
    ]);
    expect(heard(words)).toEqual([
      { text: 'Paul', ...voicedAt(0.4, 0.8) },
      { text: 'says', ...voicedAt(1.3, 1.7) },
    ]);
  });

  test('an estimate has no audio: its voice is its span', () => {
    expect(unmeasured([{ text: 'Amen.', start: 0.5, end: 0.9 }])).toEqual([
      { text: 'Amen.', start: 0.5, end: 0.9, voiced: voicedAt(0.5, 0.9) },
    ]);
  });
});

describe('heard seconds', () => {
  test('aligned seconds are not heard: what meets the ear takes only the voice', () => {
    const aligned: ReadonlyArray<TakeWord> = voicedWords(
      [{ text: 'Paul', start: 0, end: 0.8 }],
      take(1, [[0.4, 0.8]]),
    );
    // @ts-expect-error a take's aligned words are not words timed by the voice
    const asHeard: ReadonlyArray<HeardWord> = aligned;
    // @ts-expect-error an aligned start is not where the voice is heard
    const span: Voiced = { start: aligned[0]?.start ?? 0, end: 0 };
    const byVoice: ReadonlyArray<HeardWord> = heard(aligned);
    expect([asHeard.length, span.end, byVoice[0]?.start]).toEqual([1, 0, 0.4]);
  });
});
