/**
 * The stanza choice on small hand-built hymns (placeholder lines, no hymn's
 * words): the stored choice's schema, the kept lines with a refrain bound to
 * a stanza and one that is the hymn's own, a cut's lines and maps, and the
 * chips' toggle. Every compiled hymn and every subset of its stanzas is
 * `stanzas.choice.slow.test.ts`.
 */

import { describe, expect, it } from 'bun:test';
import { Schema } from 'effect';

import type { TimedLine, Timeline } from '~/follow/timeline';
import type { Section } from '~/hymns/text';

import { Choice, cutOf, keptOf, toggle } from './stanzas';

const decodes = Schema.is(Choice);

describe('a stored choice', () => {
  it('is the stanza numbers, ascending, each once', () => {
    expect([[], [1], [1, 3], [2, 3, 4]].map((value) => decodes(value))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect([[3, 1], [1, 1], [0], [1.5], ['1']].map((value) => decodes(value))).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

/** Two stanzas of two lines, each with a refrain of one line after it, then the hymn's own closing refrain. */
const sections: ReadonlyArray<Section> = [
  { kind: 'stanza', n: 1, lines: ['a', 'b'] },
  { kind: 'refrain', stanza: 1, lines: ['r'] },
  { kind: 'stanza', n: 2, lines: ['c', 'd'] },
  { kind: 'refrain', stanza: 2, lines: ['r'] },
  { kind: 'refrain', stanza: 0, lines: ['z'] },
];

describe('the kept lines', () => {
  it('keep a stanza, the refrain bound to it and the hymn’s own refrain', () => {
    expect(keptOf(sections, [])).toEqual([true, true, true, true, true, true, true]);
    expect(keptOf(sections, [2])).toEqual([false, false, false, true, true, true, true]);
    expect(keptOf(sections, [1])).toEqual([true, true, true, false, false, false, true]);
  });

  it('take no account of a number outside the hymn’s stanzas', () => {
    expect(keptOf(sections, [0, 2, 3])).toEqual(keptOf(sections, [2]));
    expect(keptOf(sections, [3])).toEqual(keptOf(sections, []));
  });
});

const line = (start: number, until: number, syllables: ReadonlyArray<number>): TimedLine => ({
  start,
  until,
  played: true,
  even: false,
  syllables,
  words: syllables.map((_, k) => k),
});

/** A lead of 1000 ms, then three lines of 1000, 2000 and 3000 ms. */
const timeline: Timeline = {
  tempo: { microsPerQuarter: 500_000, numerator: 4, denominator: 4 },
  first: 1000,
  end: 7000,
  lines: [line(1000, 2000, [1000, 1500]), line(2000, 4000, [2000]), line(4000, 7000, [4000, 5000])],
};

describe('a cut', () => {
  it('runs the kept lines on from the first and lays a skipped one at the next kept start', () => {
    const cut = cutOf(timeline, [true, false, true]);
    expect(cut.timeline.end).toBe(5000);
    expect(cut.timeline.lines.map((l) => [l.start, l.until, l.syllables])).toEqual([
      [1000, 2000, [1000, 1500]],
      [2000, 2000, []],
      [2000, 5000, [2000, 3000]],
    ]);
  });

  it('maps sung time to the recording and back, the lead and the tail as they are', () => {
    const cut = cutOf(timeline, [true, false, true]);
    expect([500, 1500, 2500, 5000, 5400].map(cut.recordingAt)).toEqual([
      500, 1500, 4500, 7000, 7400,
    ]);
    expect([500, 1500, 2500, 4500, 7000, 7400].map(cut.sungAt)).toEqual([
      500, 1500, 2000, 2500, 5000, 5400,
    ]);
  });

  it('skips the last lines to the end, where the tail starts', () => {
    const cut = cutOf(timeline, [true, true, false]);
    expect(cut.timeline.end).toBe(4000);
    expect([cut.sungAt(5000), cut.recordingAt(4000)]).toEqual([4000, 7000]);
  });

  it('names each run of skipped lines as a span of the recording, to the next kept start or the end', () => {
    expect(cutOf(timeline, [true, false, true]).skips).toEqual([{ from: 2000, to: 4000 }]);
    expect(cutOf(timeline, [false, true, false]).skips).toEqual([
      { from: 1000, to: 2000 },
      { from: 4000, to: 7000 },
    ]);
    expect(cutOf(timeline, [true, false, false]).skips).toEqual([{ from: 2000, to: 7000 }]);
  });

  it('is the timeline itself when every line is kept', () => {
    const cut = cutOf(timeline, [true, true, true]);
    expect(cut.timeline).toBe(timeline);
    expect(cut.skips).toEqual([]);
  });
});

describe('a chip’s tap', () => {
  it('turns a stanza off from all, on again, and never the last one off', () => {
    const taps = [2, 4, 1, 3, 1, 2, 4];
    const seen: Array<ReadonlyArray<number>> = [];
    let choice: ReadonlyArray<number> = [];
    for (const stanza of taps) {
      choice = toggle(choice, stanza, 4);
      seen.push(choice);
    }
    expect(seen).toEqual([[1, 3, 4], [1, 3], [3], [3], [1, 3], [1, 2, 3], []]);
  });

  it('takes no tap on a number outside the hymn’s stanzas', () => {
    expect([toggle([], 5, 4), toggle([1], 0, 4)]).toEqual([[], [1]]);
  });
});
