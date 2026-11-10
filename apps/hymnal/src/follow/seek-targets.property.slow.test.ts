import { expect, test } from 'bun:test';
import { Array as Arr, Option } from 'effect';

import { readTiming } from '../../vite/timing';
import { readWords } from '../../vite/words';
import type { HymnText } from '../hymns/text';
import { initialTarget, type SeekTargets, targetAt, targetsOf } from './seek-targets';
import { type TimedLine, type Timeline, timingBook } from './timeline';

interface Census {
  hymns: number;
  lines: number;
  timed: number;
  lineOnly: number;
  shared: number;
  subsets: number;
  words: number;
  repeated: number;
  hymn663: number;
  punctuation: number;
}

const checkWords = (
  targets: SeekTargets,
  source: TimedLine,
  index: number,
  start: number,
  lexical: number,
  all: boolean,
  census: Census,
) => {
  const earliest = new Map<number, number>();
  for (const [syllable, ms] of source.syllables.entries()) {
    const ordinal = Arr.getUnsafe(source.words, syllable);
    earliest.set(ordinal, Math.min(earliest.get(ordinal) ?? Infinity, ms));
  }
  expect(earliest.size).toBe(lexical);
  for (const [ordinal, ms] of earliest) {
    const sung = start + ms - source.start;
    expect(targetAt(targets, index, Option.some(ordinal))).toEqual(
      Option.some({ _tag: 'Word', line: index, word: ordinal, ms: sung }),
    );
    expect(sung >= start && sung < start + source.until - source.start).toBe(true);
    const shared = [...earliest].filter(([, time]) => time === ms).map(([word]) => word);
    const projected = targets.lines.find((line) => line.line === index);
    expect(projected?._tag).toBe('WordTimed');
    if (projected?._tag === 'WordTimed') expect(projected.words[ordinal]?.shared).toEqual(shared);
    expect(initialTarget(targets, sung)).toEqual(
      Option.some({ _tag: 'Word', line: index, word: Math.max(...shared), ms: sung }),
    );
    if (all) {
      census.words++;
    }
  }
  for (const invalid of [-1, 0.5, earliest.size, NaN, Infinity, -Infinity])
    expect(Option.isNone(targetAt(targets, index, Option.some(invalid)))).toBe(true);
};

const countLine = (
  census: Census,
  number: number,
  index: number,
  text: string,
  refrain: boolean,
  trusted: boolean,
  lexical: number,
) => {
  census.lines++;
  if (trusted) census.timed++;
  else census.lineOnly++;
  if (refrain) census.repeated++;
  if (number === 663) census.hymn663++;
  if (
    (number === 18 && index === 33) ||
    (number === 128 && index === 10) ||
    (number === 578 && index === 8)
  ) {
    expect(text.trim().split(/\s+/u).length).toBe(lexical + 1);
    census.punctuation++;
  }
};

const checkSubset = (
  hymn: HymnText,
  timeline: Timeline,
  chosen: number[],
  count: number,
  census: Census,
) => {
  const all = chosen.length === count;
  const targets = Option.getOrThrow(targetsOf(hymn, timeline, chosen));
  const displayed = hymn.sections.flatMap((section) =>
    section.lines.map((text) => {
      let owner = 0;
      if (section.kind === 'stanza') owner = section.n;
      else owner = section.stanza;
      return { text, owner, refrain: section.kind === 'refrain' };
    }),
  );
  let at = timeline.first;
  const expected: Array<{ line: number; start: number; until: number }> = [];
  for (const [index, source] of timeline.lines.entries()) {
    const display = Arr.getUnsafe(displayed, index);
    const kept = display.owner === 0 || chosen.includes(display.owner);
    if (!kept) {
      expect(Option.isNone(targetAt(targets, index, Option.none()))).toBe(true);
      continue;
    }
    let start = at;
    if (all) start = source.start;
    const until = start + source.until - source.start;
    at = until;
    const lexical = display.text
      .split(/\s+/u)
      .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
    if (source.until === source.start || lexical === 0) continue;
    expected.push({ line: index, start, until });
    expect(targetAt(targets, index, Option.none())).toEqual(
      Option.some({ _tag: 'Line', line: index, ms: start }),
    );
    const trusted = source.played && !source.even && source.syllables.length > 0;
    if (all) {
      countLine(census, hymn.number, index, display.text, display.refrain, trusted, lexical);
      census.shared += source.syllables.filter(
        (time, syllable) =>
          syllable > 0 &&
          time === source.syllables[syllable - 1] &&
          source.words[syllable] !== source.words[syllable - 1],
      ).length;
    }
    if (!trusted) {
      expect(Option.isNone(targetAt(targets, index, Option.some(0)))).toBe(true);
      expect(initialTarget(targets, start)).toEqual(
        Option.some({ _tag: 'Line', line: index, ms: start }),
      );
    } else checkWords(targets, source, index, start, lexical, all, census);
  }
  expect(targets.lines.map(({ line, start, until }) => ({ line, start, until }))).toEqual(expected);
  expect(Option.isSome(initialTarget(targets, 0))).toBe(true);
  expect(Option.isSome(initialTarget(targets, timeline.end + 1000))).toBe(true);
};

test('every corpus stanza subset, occurrence and word keeps independent sung score coordinates', () => {
  const book = timingBook(readTiming());
  const census = {
    hymns: 0,
    lines: 0,
    timed: 0,
    lineOnly: 0,
    shared: 0,
    subsets: 0,
    words: 0,
    repeated: 0,
    hymn663: 0,
    punctuation: 0,
  };
  for (const hymn of readWords()) {
    census.hymns++;
    const timeline = Option.getOrThrow(book.of(hymn.number));
    const count = hymn.sections.filter((section) => section.kind === 'stanza').length;
    for (let mask = 1; mask < 2 ** count; mask++) {
      census.subsets++;
      const chosen = Array.from({ length: count }, (_, k) => k + 1).filter(
        (n) => (mask & (1 << (n - 1))) !== 0,
      );
      checkSubset(hymn, timeline, chosen, count, census);
    }
  }
  expect(census.hymns).toBe(695);
  expect(census.lines).toBe(15_560);
  expect(census.timed).toBe(15_085);
  expect(census.lineOnly).toBe(475);
  expect(census.shared).toBe(33);
  expect(census.subsets).toBe(9475);
  expect(census.words).toBeGreaterThan(70_000);
  expect(census.repeated).toBeGreaterThan(1000);
  expect(census.hymn663).toBe(7);
  expect(census.punctuation).toBe(3);
});

const generated = (seed: number) => {
  let at = seed % 17;
  const sections: HymnText['sections'][number][] = [];
  const lines: Timeline['lines'][number][] = [];
  const earliest: number[][] = [];
  for (let index = 0; index < 12; index++) {
    const start = at;
    const duration = 20 + ((seed * 13 + index * 7) % 53);
    at += duration;
    const kind = (seed + index) % 6;
    let text = 'alpha — beta gamma';
    let syllables = [start + 1, start + 3, start + 3, start + 7, start + 9];
    let words = [0, 0, 1, 1, 2];
    let second = start + 3;
    if (seed % 2 === 0) {
      syllables = [start + 1, start + 1, start + 1, start + 7, start + 9];
      second = start + 1;
    }
    if (kind === 0) {
      syllables = [];
      words = [];
    }
    if (kind === 1) {
      text = ' — ';
      syllables = [];
      words = [];
    }
    if (kind === 2) {
      text = '';
      syllables = [];
      words = [];
    }
    sections.push({ kind: 'stanza', n: index + 1, lines: [text] });
    lines.push({ start, until: at, syllables, words, played: kind !== 3, even: kind === 4 });
    earliest.push([start + 1, second, start + 9]);
  }
  const hymn: HymnText = { number: seed + 1, title: '', firstLine: '', topic: '', sections };
  const timeline: Timeline = {
    tempo: { microsPerQuarter: 500_000, numerator: 4, denominator: 4 },
    lines,
    first: seed % 17,
    end: at,
  };
  const chosen = sections.flatMap((_, index) => {
    if ((seed * 7 + index * 3) % 5 === 0) return [];
    return [index + 1];
  });
  return { hymn, timeline, chosen, earliest };
};

test('128 generated scores independently preserve earliest syllables, cuts, shared times and exact requests', () => {
  const coverage = new Set<string>();
  for (let seed = 0; seed < 128; seed++) {
    const { hymn, timeline, chosen, earliest } = generated(seed);
    const targets = Option.getOrThrow(targetsOf(hymn, timeline, chosen));
    let sung = timeline.first;
    for (const [index, line] of timeline.lines.entries()) {
      if (!chosen.includes(index + 1)) {
        coverage.add('skipped');
        expect(Option.isNone(targetAt(targets, index, Option.none()))).toBe(true);
        continue;
      }
      const start = sung;
      sung += line.until - line.start;
      const kind = (seed + index) % 6;
      coverage.add(`kind${kind}`);
      if (kind === 1 || kind === 2) {
        expect(Option.isNone(targetAt(targets, index, Option.none()))).toBe(true);
        continue;
      }
      expect(targetAt(targets, index, Option.none())).toEqual(
        Option.some({ _tag: 'Line', line: index, ms: start }),
      );
      if (kind !== 5) {
        expect(Option.isNone(targetAt(targets, index, Option.some(0)))).toBe(true);
        continue;
      }
      for (const [word, onset] of (earliest[index] ?? []).entries())
        expect(targetAt(targets, index, Option.some(word))).toEqual(
          Option.some({ _tag: 'Word', line: index, word, ms: start + onset - line.start }),
        );
    }
  }
  expect([...coverage].toSorted()).toEqual([
    'kind0',
    'kind1',
    'kind2',
    'kind3',
    'kind4',
    'kind5',
    'skipped',
  ]);
});

const anchorOracle = (seed: number) => {
  const world = generated(seed);
  let at = world.timeline.first;
  const eligible: Array<{ line: number; start: number; onsets: number[] }> = [];
  for (const [index, line] of world.timeline.lines.entries()) {
    if (!world.chosen.includes(index + 1)) continue;
    const start = at;
    at += line.until - line.start;
    const kind = (seed + index) % 6;
    if (kind === 1 || kind === 2) continue;
    let onsets: number[] = [];
    if (kind === 5)
      onsets = Arr.getUnsafe(world.earliest, index).map((onset) => start + onset - line.start);
    eligible.push({ line: index, start, onsets });
  }
  return { ...world, eligible, end: at };
};

for (let seed = 0; seed < 128; seed++)
  test(`initial anchor independent score seed ${seed}`, () => {
    const { hymn, timeline, chosen, eligible, end } = anchorOracle(seed);
    const targets = Option.getOrThrow(targetsOf(hymn, timeline, chosen));
    for (let ms = 0; ms <= end + 2; ms += 0.5) {
      const line = eligible.filter((line) => line.start <= ms).at(-1) ?? Arr.getUnsafe(eligible, 0);
      if (line.onsets.length === 0) {
        expect(initialTarget(targets, ms)).toEqual(
          Option.some({ _tag: 'Line', line: line.line, ms: line.start }),
        );
      } else {
        const before = line.onsets.flatMap((onset, word) => {
          if (onset <= ms) return [word];
          return [];
        });
        const word = before.at(-1) ?? 0;
        expect(initialTarget(targets, ms)).toEqual(
          Option.some({
            _tag: 'Word',
            line: line.line,
            word,
            ms: Arr.getUnsafe(line.onsets, word),
          }),
        );
      }
    }
  });

test('zero spans and empty projections are ineligible; malformed timing is rejected even when unplayed', () => {
  const hymn: HymnText = {
    number: 1,
    title: '',
    firstLine: '',
    topic: '',
    sections: [{ kind: 'stanza', n: 1, lines: ['alpha beta', 'alpha beta'] }],
  };
  const base = {
    start: 100,
    until: 200,
    played: false,
    even: false,
    syllables: [110, 120],
    words: [0, 1],
  };
  const timeline: Timeline = {
    tempo: { microsPerQuarter: 500_000, numerator: 4, denominator: 4 },
    first: 100,
    end: 200,
    lines: [{ ...base, until: 100, syllables: [], words: [] }, base],
  };
  const targets = Option.getOrThrow(targetsOf(hymn, timeline, []));
  expect(targets.lines.map(({ line }) => line)).toEqual([1]);
  for (const invalid of [NaN, Infinity, -Infinity, -1, 0.5, 2])
    expect(Option.isNone(targetAt(targets, invalid, Option.none()))).toBe(true);
  for (const invalid of [NaN, Infinity, -Infinity, -1])
    expect(Option.isNone(initialTarget(targets, invalid))).toBe(true);
  for (const words of [
    [0, -1],
    [0, NaN],
    [0, Infinity],
    [0, 0],
    [0, 2],
    [1, 0],
    [0, 0.5],
  ])
    expect(
      Option.isNone(
        targetsOf(
          hymn,
          { ...timeline, lines: [timeline.lines[0] ?? base, { ...base, words }] },
          [],
        ),
      ),
    ).toBe(true);
  for (const syllables of [
    [110, Infinity],
    [110, NaN],
    [110, -Infinity],
    [110],
    [120, 110],
    [99, 120],
    [110, 200],
  ])
    expect(
      Option.isNone(
        targetsOf(
          hymn,
          { ...timeline, lines: [timeline.lines[0] ?? base, { ...base, syllables }] },
          [],
        ),
      ),
    ).toBe(true);
  expect(
    Option.isNone(
      targetsOf(
        hymn,
        {
          ...timeline,
          lines: [
            { ...base, until: 150 },
            { ...base, start: 140 },
          ],
        },
        [],
      ),
    ),
  ).toBe(true);
  expect(Option.isNone(targetsOf({ ...hymn, sections: [] }, { ...timeline, lines: [] }, []))).toBe(
    true,
  );
  expect(
    Option.isNone(
      targetsOf(
        hymn,
        {
          ...timeline,
          end: 100,
          lines: timeline.lines.map((line) => ({ ...line, until: 100, syllables: [], words: [] })),
        },
        [],
      ),
    ),
  ).toBe(true);
});
