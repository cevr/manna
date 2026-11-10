import { expect, test } from 'bun:test';
import { Option } from 'effect';

import type { HymnText } from '../hymns/text';
import { initialTarget, targetAt, targetsOf } from './seek-targets';
import type { Timeline } from './timeline';

const hymn: HymnText = {
  number: 1,
  title: 'Fixture',
  firstLine: '',
  topic: '',
  sections: [
    { kind: 'stanza', n: 1, lines: ['alpha beta'] },
    { kind: 'refrain', stanza: 1, lines: ['alpha beta'] },
    { kind: 'stanza', n: 2, lines: ['alpha beta'] },
    { kind: 'refrain', stanza: 2, lines: ['alpha beta'] },
  ],
};

const timeline: Timeline = {
  tempo: { microsPerQuarter: 500_000, numerator: 4, denominator: 4 },
  first: 100,
  end: 500,
  lines: [100, 200, 300, 400].map((start) => ({
    start,
    until: start + 100,
    played: true,
    even: false,
    syllables: [start + 10, start + 20, start + 20],
    words: [0, 0, 1],
  })),
};

test('retained repeated occurrences keep their original identity in sung time', () => {
  const targets = Option.getOrThrow(targetsOf(hymn, timeline, [2]));
  expect(targets.number).toBe(1);
  expect(targets.choice).toEqual([2]);
  expect(targets.lines.map(({ line, start, until }) => [line, start, until])).toEqual([
    [2, 100, 200],
    [3, 200, 300],
  ]);
  expect(targetAt(targets, 0, Option.none())).toEqual(Option.none());
  expect(targetAt(targets, 3, Option.none())).toEqual(
    Option.some({ _tag: 'Line', line: 3, ms: 200 }),
  );
  expect(targetAt(targets, 3, Option.some(0))).toEqual(
    Option.some({ _tag: 'Word', line: 3, word: 0, ms: 210 }),
  );
  expect(targetAt(targets, 3, Option.some(1))).toEqual(
    Option.some({ _tag: 'Word', line: 3, word: 1, ms: 220 }),
  );
});

test('stripped, unplayed and even timing offers no fabricated word precision', () => {
  for (const replacement of [{ played: false }, { even: true }, { syllables: [], words: [] }]) {
    const targets = Option.getOrThrow(
      targetsOf(
        hymn,
        {
          ...timeline,
          lines: timeline.lines.map((line) => ({ ...line, ...replacement })),
        },
        [],
      ),
    );
    expect(targets.lines.every((line) => line._tag === 'LineOnly')).toBe(true);
    expect(targetAt(targets, 0, Option.some(0))).toEqual(Option.none());
    expect(initialTarget(targets, 100)).toEqual(Option.some({ _tag: 'Line', line: 0, ms: 100 }));
  }
});

test('intro, boundaries, shared words and tail use last-at-or-before onsets', () => {
  const shared = {
    ...timeline,
    lines: timeline.lines.map((line) => ({
      ...line,
      syllables: [line.start + 10, line.start + 10],
      words: [0, 1],
    })),
  };
  const targets = Option.getOrThrow(targetsOf(hymn, shared, []));
  for (const [at, line, word, ms] of [
    [0, 0, 0, 110],
    [110, 0, 1, 110],
    [200, 1, 0, 210],
    [999, 3, 1, 410],
  ] as const)
    expect(initialTarget(targets, at)).toEqual(Option.some({ _tag: 'Word', line, word, ms }));
  const first = targets.lines[0];
  expect(first?._tag).toBe('WordTimed');
  if (first?._tag === 'WordTimed')
    expect(first.words.map(({ shared }) => shared)).toEqual([
      [0, 1],
      [0, 1],
    ]);
  for (const invalid of [-1, 0.5, 4, NaN, Infinity, -Infinity]) {
    expect(targetAt(targets, invalid, Option.none())).toEqual(Option.none());
    expect(targetAt(targets, 0, Option.some(invalid))).toEqual(Option.none());
  }
  for (const invalid of [-1, NaN, Infinity, -Infinity])
    expect(initialTarget(targets, invalid)).toEqual(Option.none());
});

test('malformed geometry and nonempty timing fail closed while stripped timing stays usable', () => {
  for (const replacement of [
    { start: NaN },
    { start: -1 },
    { until: Infinity },
    { until: 99 },
    { syllables: [110], words: [] },
    { syllables: [99, 120], words: [0, 1] },
    { syllables: [120, 110], words: [0, 1] },
    { syllables: [110, 200], words: [0, 1] },
    { syllables: [110, NaN], words: [0, 1] },
    { syllables: [110, 120], words: [0, 2] },
    { syllables: [110, 120], words: [1, 1] },
    { syllables: [110, 120], words: [0, 0.5] },
  ])
    expect(
      Option.isNone(
        targetsOf(
          hymn,
          {
            ...timeline,
            lines: timeline.lines.map((line, index) => {
              if (index === 0) return { ...line, ...replacement };
              return line;
            }),
          },
          [],
        ),
      ),
    ).toBe(true);
  expect(Option.isNone(targetsOf(hymn, { ...timeline, first: 0 }, []))).toBe(true);
  expect(Option.isNone(targetsOf(hymn, { ...timeline, end: 501 }, []))).toBe(true);
  expect(Option.isNone(targetsOf(hymn, { ...timeline, lines: timeline.lines.slice(1) }, []))).toBe(
    true,
  );
});

test('stanza fallback matches all and standalone punctuation is not another word', () => {
  const punctuation = {
    ...hymn,
    sections: hymn.sections.map((section) => ({ ...section, lines: ['alpha — beta'] })),
  };
  const all = Option.getOrThrow(targetsOf(punctuation, timeline, []));
  expect(targetsOf(punctuation, timeline, [99])).toEqual(Option.some(all));
  expect(targetsOf(punctuation, timeline, [1, 2])).toEqual(Option.some(all));
  expect(all.choice).toEqual([]);
});

test('small numeric scores preserve earliest word onsets across every retained occurrence', () => {
  for (let seed = 0; seed < 16; seed++) {
    const first = seed * 3;
    const duration = 20 + seed;
    const lines = timeline.lines.map((line, index) => ({
      ...line,
      start: first + index * duration,
      until: first + (index + 1) * duration,
      syllables: [
        first + index * duration + 1,
        first + index * duration + 2,
        first + index * duration + 3,
      ],
    }));
    const score = { ...timeline, first, end: first + 4 * duration, lines };
    const targets = Option.getOrThrow(targetsOf(hymn, score, [2]));
    for (const [index, ordinal] of [
      [2, 0],
      [2, 1],
      [3, 0],
      [3, 1],
    ] as const) {
      let offset = 1;
      if (ordinal === 1) offset = 3;
      expect(targetAt(targets, index, Option.some(ordinal))).toEqual(
        Option.some({
          _tag: 'Word',
          line: index,
          word: ordinal,
          ms: first + (index - 2) * duration + offset,
        }),
      );
    }
  }
});
