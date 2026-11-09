/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the property draws its texts and layouts with plain branches, writes its reference forms as plain loops, and tallies its kinds in a plain map. */

/**
 * The reading view's words (hslight L1, L2, L5). Its seams: `shownWordsOf`,
 * judged against a reference that walks the text one UTF-16 unit at a time,
 * for generated texts of 0-60 words (letters of five scripts, astral
 * letters, combining marks, numbers, leading and trailing marks, mark-only
 * runs between words and at either end, every kind of whitespace); and
 * `wordAt`, judged against a reference written as plain loops, for
 * generated layouts (lines of words with their own heights and gaps, some
 * words not yet laid out) and points on a word, in a gap, between lines and
 * outside every box.
 *
 * It catches a mark-only run dropped or given to the next word, a word cut
 * at its letters rather than its run, a lost character, a hit test by x
 * alone, by the nearest box over every line, or by a line's first box's
 * height alone, ties to the later line or word, and a missing box read as
 * a word. It misses where the boxes come from: that is the view's test.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { sourceWords } from '../matcher/words';
import { below, random } from '../test/garden-model';
import { type Box, shownWordsOf, wordAt } from './words';

const CORES = [
  'and',
  'Lord',
  'é',
  'e\u0301',
  'αγάπη',
  'жизнь',
  'שלום',
  '愛',
  '𝒜dam',
  '𐌰𐌱',
  '3',
  '½',
  '144',
];
const LEADS = ['(', '"', '‘', '[', '—', '...', '\u0301'];
const TRAILS = ['.', ',', ';', '?', ',"', '.)', '—', "'s", '?’', '...', '¶'];
const SPACES = [' ', ' ', ' ', '\t', '\n', '\u00a0', '  ', ' \u2003 ', '\r\n'];
const MARK_RUNS = ['—', '¶', '...', ',', '-', '\u0301', '«»', '𝄞'];

const pick = <A>(next: () => number, list: readonly A[]): A => list[below(next, list.length)]!;

/** A text of `count` words, from `next`: whitespace of every kind, mark-only runs between words and at either end. */
const textOf = (next: () => number, count: number): string => {
  const parts: string[] = [];
  if (below(next, 4) === 0) parts.push(pick(next, SPACES));
  if (below(next, 5) === 0) parts.push(pick(next, MARK_RUNS), pick(next, SPACES));
  for (let index = 0; index < count; index += 1) {
    if (index > 0) parts.push(pick(next, SPACES));
    if (index > 0 && below(next, 8) === 0) parts.push(pick(next, MARK_RUNS), pick(next, SPACES));
    const lead = below(next, 10) === 0 ? pick(next, LEADS) : '';
    const trail = below(next, 4) === 0 ? pick(next, TRAILS) : '';
    parts.push(`${lead}${pick(next, CORES)}${trail}`);
  }
  if (below(next, 4) === 0) parts.push(pick(next, SPACES), pick(next, MARK_RUNS));
  if (below(next, 4) === 0) parts.push(pick(next, SPACES));
  return parts.join('');
};

const BLANK = /\s/u;
const WORDLY = /[\p{L}\p{N}]/u;

/** L2's reference: the text's runs found unit by unit, the wordy ones kept, each shown from its start to the next wordy run's start. */
const shownRule = (text: string): string[] => {
  const runs: Array<{ start: number; end: number }> = [];
  let start = -1;
  for (let i = 0; i <= text.length; i += 1) {
    const blank = i === text.length || BLANK.test(text.charAt(i));
    if (!blank && start < 0) start = i;
    if (blank && start >= 0) {
      runs.push({ start, end: i });
      start = -1;
    }
  }
  const words = runs.filter((run) => WORDLY.test(text.slice(run.start, run.end)));
  const shown: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const from = i === 0 ? 0 : words[i]!.start;
    const to = i + 1 < words.length ? words[i + 1]!.start : text.length;
    shown.push(text.slice(from, to).trim());
  }
  return shown;
};

/** L5's reference, over boxes by word number with gaps for words not laid out. */
const wordAtRule = (
  px: number,
  py: number,
  boxes: ReadonlyArray<Box | undefined>,
): number | null => {
  const tops: number[] = [];
  for (const box of boxes) if (box && !tops.includes(box.y)) tops.push(box.y);
  tops.sort((a, b) => a - b);
  if (tops.length === 0) return null;
  let line = tops[0]!;
  let bestDy = Infinity;
  for (const top of tops) {
    let bottom = -Infinity;
    for (const box of boxes)
      if (box && box.y === top) bottom = Math.max(bottom, box.y + box.height);
    const dy = Math.max(0, top - py, py - bottom);
    if (dy < bestDy) {
      bestDy = dy;
      line = top;
    }
  }
  let best: number | null = null;
  let bestDx = Infinity;
  for (let i = 0; i < boxes.length; i += 1) {
    const box = boxes[i];
    if (!box || box.y !== line) continue;
    const dx = Math.max(0, box.x - px, px - (box.x + box.width));
    if (dx < bestDx) {
      bestDx = dx;
      best = i;
    }
  }
  return best;
};

/** A layout of `count` words in lines, from `next`: each word's width and height, the gap after it, a line's top, and now and then a word not yet laid out. */
const layoutOf = (next: () => number, count: number): Array<Box | undefined> => {
  const width = 200 + below(next, 200);
  const lineGap = pick(next, [0, 0, 4, 12]);
  const boxes: Array<Box | undefined> = [];
  let x = 0;
  let top = below(next, 3) * 7;
  let lineHeight = 36;
  for (let i = 0; i < count; i += 1) {
    const w = 10 + below(next, 90);
    const h = pick(next, [36, 36, 36, 30, 44]);
    if (x > 0 && x + w > width) {
      top += lineHeight + lineGap;
      x = 0;
      lineHeight = 36;
    }
    lineHeight = Math.max(lineHeight, h);
    boxes.push(below(next, 12) === 0 ? undefined : { x, y: top, width: w, height: h });
    x += w + pick(next, [0, 4, 6, 10]);
  }
  return boxes;
};

/** A finger's point and where it lies. */
interface Point {
  readonly x: number;
  readonly y: number;
  readonly kind: 'on a word' | 'in a gap' | 'between lines' | 'outside';
}

/** A point over `boxes`, from `next`, and its kind: on a word, in a gap after one, between two lines, or outside every box. */
const pointOf = (next: () => number, boxes: ReadonlyArray<Box | undefined>): Point => {
  const known = boxes.filter((box): box is Box => box !== undefined);
  const roll = below(next, 4);
  if (known.length === 0 || roll === 3) {
    const far = pick(next, [-60, -1, 500, 900]);
    return {
      x: below(next, 2) === 0 ? far : below(next, 400),
      y: far + below(next, 3),
      kind: 'outside',
    };
  }
  const box = pick(next, known);
  if (roll === 0)
    return { x: box.x + next() * box.width, y: box.y + next() * box.height, kind: 'on a word' };
  if (roll === 1)
    return { x: box.x + box.width + 1 + below(next, 5), y: box.y + 5, kind: 'in a gap' };
  return {
    x: box.x + below(next, 20),
    y: box.y + box.height + 1 + below(next, 10),
    kind: 'between lines',
  };
};

const mapOf = (boxes: ReadonlyArray<Box | undefined>): ReadonlyMap<number, Box> =>
  new Map(boxes.flatMap((box, i) => (box ? [[i, box] as const] : [])));

const tally = (counts: Map<string, number>, key: string) =>
  counts.set(key, (counts.get(key) ?? 0) + 1);

describe('the reading view words', () => {
  it('shows each word from its run to the next word, as L2 does, losing no character but whitespace', () => {
    const next = random(0x11e7);
    const counts = new Map<string, number>();
    const faults: string[] = [];
    for (let c = 0; c < 1500; c += 1) {
      const count = below(next, 8) === 0 ? pick(next, [0, 1, 60]) : below(next, 30);
      const text = textOf(next, count);
      const got = [...shownWordsOf(text)];
      const want = shownRule(text);
      if (MARK_RUNS.some((run) => text.includes(` ${run}`))) tally(counts, 'mark run');
      if (want.length === 0) tally(counts, 'no words');
      if (JSON.stringify(got) !== JSON.stringify(want))
        faults.push(`case ${c} (${want.length} words): ${got.length} shown words differ from L2's`);
      if (got.length !== sourceWords(text).length)
        faults.push(`case ${c}: ${got.length} shown for ${sourceWords(text).length} words`);
      const bare = (each: string) => each.replace(/\s/gu, '');
      if (want.length > 0 && bare(got.join('')) !== bare(text))
        faults.push(`case ${c}: a character other than whitespace is lost`);
    }
    expect(faults.slice(0, 10)).toEqual([]);
    expect([counts.get('mark run') ?? 0, counts.get('no words') ?? 0].every((n) => n >= 40)).toBe(
      true,
    );
  });

  it('keeps a mark-only run with the word before it, and one before the first word with the first', () => {
    expect(shownWordsOf('— one two ... three —')).toEqual(['— one', 'two ...', 'three —']);
    expect(shownWordsOf('  ')).toEqual([]);
    expect(shownWordsOf('¶ 𝒜dam, e\u0301 ')).toEqual(['¶ 𝒜dam,', 'e\u0301']);
  });

  it('finds the word under a point as L5 does, over generated layouts and points', () => {
    const next = random(0x5a7);
    const counts = new Map<string, number>();
    const faults: string[] = [];
    for (let c = 0; c < 800; c += 1) {
      const boxes = layoutOf(next, below(next, 10) === 0 ? 0 : 1 + below(next, 40));
      const lines = new Set(boxes.flatMap((box) => (box ? [box.y] : []))).size;
      if (lines > 1) tally(counts, 'lines');
      for (let p = 0; p < 6; p += 1) {
        const point = pointOf(next, boxes);
        tally(counts, point.kind);
        const got = Option.getOrNull(wordAt(point.x, point.y, mapOf(boxes)));
        const want = wordAtRule(point.x, point.y, boxes);
        if (got !== want)
          faults.push(
            `case ${c}.${p} (${point.kind}, ${lines} lines): word ${got} where L5 has ${want}`,
          );
      }
    }
    expect(faults.slice(0, 10)).toEqual([]);
    const floors = {
      lines: 400,
      'on a word': 800,
      'in a gap': 800,
      'between lines': 800,
      outside: 800,
    };
    expect(Object.entries(floors).filter(([key, floor]) => (counts.get(key) ?? 0) < floor)).toEqual(
      [],
    );
  });

  it('breaks ties to the earlier line, then the earlier word, and finds none with no boxes', () => {
    const boxes = new Map<number, Box>([
      [0, { x: 0, y: 0, width: 10, height: 36 }],
      [1, { x: 20, y: 0, width: 10, height: 36 }],
      [2, { x: 0, y: 40, width: 10, height: 36 }],
    ]);
    expect(Option.getOrNull(wordAt(15, 10, boxes))).toBe(0);
    expect(Option.getOrNull(wordAt(5, 38, boxes))).toBe(0);
    expect(Option.getOrNull(wordAt(25, 60, boxes))).toBe(2);
    expect(Option.isNone(wordAt(5, 5, new Map()))).toBe(true);
  });
});
