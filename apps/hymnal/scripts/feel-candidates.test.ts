/**
 * The sound candidates' files, rendered in memory: two or three candidates
 * of each kind, three takes each, every one a 16-bit mono WAV at the
 * voice's rate; the one detent sounds once and the slow turn every detent;
 * the fling holds only the sounds the Feel lets start, none over the one
 * before; and the README names every file and marks the picked candidates.
 */

import { describe, expect, it } from 'bun:test';

import { keyPitch, PICKED, RATE, RECIPES, THOCKS, TONES } from '../src/feel/voice';
import { candidateFiles, readmeOf } from './feel-candidates';

const files = candidateFiles();

const text = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.slice(at, at + 4));

describe('the sound candidates', () => {
  it('are two or three of each kind, with a one, a slow and a fling take each', () => {
    for (const [kind, of] of [
      ['thock', THOCKS],
      ['tone', TONES],
    ] as const) {
      const names = Object.keys(of);
      expect(names.length >= 2 && names.length <= 3).toBe(true);
      expect(files.filter((f) => f.kind === kind).map((f) => `${f.candidate} ${f.take}`)).toEqual(
        names.flatMap((name) => [`${name} one`, `${name} slow`, `${name} fling`]),
      );
    }
  });

  it('writes each take as a 16-bit mono WAV at the voice’s rate', () => {
    for (const { file, wav } of files) {
      const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
      expect({
        file,
        riff: text(wav, 0),
        wave: text(wav, 8),
        pcm: view.getUint16(20, true),
        channels: view.getUint16(22, true),
        rate: view.getUint32(24, true),
        bits: view.getUint16(34, true),
        length: view.getUint32(40, true),
      }).toEqual({
        file,
        riff: 'RIFF',
        wave: 'WAVE',
        pcm: 1,
        channels: 1,
        rate: RATE,
        bits: 16,
        length: wav.length - 44,
      });
    }
  });

  it('sounds the one detent once and every detent of the slow turn', () => {
    for (const f of files.filter((f) => f.take !== 'fling'))
      expect({ file: f.file, sounded: f.sounded.length }).toEqual({
        file: f.file,
        sounded: f.told,
      });
  });

  it('holds in the fling only sounds that start once the last has ended, and fewer than its detents', () => {
    for (const f of files.filter((x) => x.take === 'fling')) {
      const over = f.sounded.slice(1).filter((s, i) => {
        const before = f.sounded[i];
        return Boolean(before) && s.at < (before?.at ?? 0) + (before?.ms ?? 0);
      });
      expect({
        file: f.file,
        first: f.sounded[0]?.at,
        thinned: f.sounded.length < f.told,
        over,
      }).toEqual({ file: f.file, first: 0, thinned: true, over: [] });
    }
  });

  it('names every file in the README, and marks the picked candidates', () => {
    const readme = readmeOf(files);
    expect(files.filter((f) => !readme.includes(f.file)).map((f) => f.file)).toEqual([]);
    const marked = readme
      .split('\n')
      .filter((line) => line.includes('(recommended'))
      .map((line) => line.split(' ')[0]);
    expect(marked).toEqual([PICKED.thock, PICKED.tone]);
  });

  it('marks as picked the candidates the voice plays', () => {
    const thock = RECIPES.find(([name]) => name === 'thock')?.[1];
    expect(thock).toEqual(THOCKS[PICKED.thock].recipe);
    const c = RECIPES.find(([name]) => name === 'key-0')?.[1];
    expect(c).toEqual(TONES[PICKED.tone].recipe(keyPitch(0)));
  });
});
