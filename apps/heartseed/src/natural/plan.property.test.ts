/* oxlint-disable effect/noGlobals, effect/noTernary, effect/noNullish -- the model reads its plain maps and names a wrong plan by its JSON, and the generator writes its choices as plain branches. */

/**
 * A piece's natural-voice plan and its word starts against an independent
 * model written here, over a small hand-built lexicon and vocab: seeded
 * texts of its words with edge characters, runs of blanks, unknown words
 * and blank texts, then each rule's edges by hand: the cap at 200 and 201
 * for a clause, a word and a packed pair with its joining space, symbols
 * counted in code points, marks after a spoken lead and at the whole run in
 * UTF-16, and durations that do not fit a chunk.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { CHUNK_CAP, planOf, SAMPLES_PER_FRAME, startsOf, type Chunk } from './plan';

const SYMBOLS = [' ', ...',.:;?!()', ...'abdefghiklmnoprstuvwz', ...'ðˈɔɹOɛAəɪɡθʌ', '𝔹'];
const VOCAB: ReadonlyMap<string, number> = new Map(
  SYMBOLS.map((symbol, index) => [symbol, 7 + index * 3]),
);
const withoutSymbol = (symbol: string): ReadonlyMap<string, number> =>
  new Map([...VOCAB].filter(([each]) => each !== symbol));

/** Filler words: `x<n>` speaks n plain symbols, `y<n>` n astral ones (two UTF-16 units each). */
const FILLERS = Array.from({ length: 201 }, (_, index) => index + 1).flatMap((n) => [
  [`x${n}`, 'a'.repeat(n)] as const,
  [`y${n}`, '𝔹'.repeat(n)] as const,
]);
const WORDS: ReadonlyMap<string, string> = new Map([
  ['LORD', 'lˈɔɹd'],
  ['thee', 'ðˈi'],
  ['O', 'ˈO'],
  ['Lord’s', 'lˈɔɹdz'],
  ["Lord's", 'lˈɔɹdz'],
  ['well-beloved', 'vɛlbɪlˈʌvɪd'],
  ['42', 'fˈɔɹtitˈu'],
  ['𝔸men', 'ˈAmɛn'],
  ['big', '𝔹ɪɡ'],
  ['Éli', 'ˈili'],
  ['bad', 'bXd'],
  ...FILLERS,
]);

const SPOKEN_EDGE = ',.:;?!()';
const CLAUSE_END = ',.:;?!';

interface ModelWord {
  readonly location: number;
  readonly length: number;
  readonly lead: ReadonlyArray<string>;
  readonly body: ReadonlyArray<string>;
  readonly trail: ReadonlyArray<string>;
}

const isWordChar = (char: string) => /^[\p{L}\p{N}]$/u.test(char);
const isBlank = (char: string) => /^\s$/u.test(char);

/** The text's whitespace runs as [start, end) in UTF-16 units, scanned code point by code point. */
const runsOf = (text: string): ReadonlyArray<readonly [number, number]> => {
  const runs: Array<readonly [number, number]> = [];
  let start = -1;
  let at = 0;
  for (const char of text) {
    if (isBlank(char)) {
      if (start >= 0) runs.push([start, at]);
      start = -1;
    } else if (start < 0) start = at;
    at += char.length;
  }
  if (start >= 0) runs.push([start, at]);
  return runs;
};

type Modelled =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Some'; readonly chunks: ReadonlyArray<Chunk> };
const NONE: Modelled = { _tag: 'None' };

/** The rule, modelled: words, spoken symbols, clauses, units, greedy chunks, ids and marks. */
const modelPlan = (
  words: ReadonlyMap<string, string>,
  vocab: ReadonlyMap<string, number>,
  text: string,
): Modelled => {
  const said: Array<ModelWord> = [];
  for (const [start, end] of runsOf(text)) {
    const points = Array.from(text.slice(start, end));
    const first = points.findIndex(isWordChar);
    if (first < 0) continue;
    const last = points.findLastIndex(isWordChar);
    const phonemes = words.get(points.slice(first, last + 1).join(''));
    if (phonemes === undefined) return NONE;
    const word = {
      location: start,
      length: end - start,
      lead: points.slice(0, first).filter((char) => SPOKEN_EDGE.includes(char)),
      body: Array.from(phonemes),
      trail: points.slice(last + 1).filter((char) => SPOKEN_EDGE.includes(char)),
    };
    const symbols = [...word.lead, ...word.body, ...word.trail];
    if (symbols.some((symbol) => !vocab.has(symbol))) return NONE;
    if (symbols.length > 200) return NONE;
    said.push(word);
  }
  if (said.length === 0) return NONE;
  const sizeOfWord = (word: ModelWord) => word.lead.length + word.body.length + word.trail.length;
  const sizeOfAll = (group: ReadonlyArray<ModelWord>) =>
    group.map(sizeOfWord).reduce((a, b) => a + b + 1, 0) - 1;
  const clauses: Array<Array<ModelWord>> = [[]];
  for (const word of said) {
    clauses.at(-1)?.push(word);
    if (word.trail.some((char) => CLAUSE_END.includes(char))) clauses.push([]);
  }
  const units = clauses
    .filter((clause) => clause.length > 0)
    .flatMap((clause) => (sizeOfAll(clause) > 200 ? clause.map((word) => [word]) : [clause]));
  const groups: Array<Array<ModelWord>> = [];
  let openSize = 0;
  for (const unit of units) {
    const unitSize = sizeOfAll(unit);
    const open = groups.at(-1);
    if (open !== undefined && openSize + 1 + unitSize <= 200) {
      open.push(...unit);
      openSize += 1 + unitSize;
    } else {
      groups.push([...unit]);
      openSize = unitSize;
    }
  }
  const idOf = (symbol: string) => vocab.get(symbol) ?? Number.NaN;
  return {
    _tag: 'Some',
    chunks: groups.map((group) => {
      const ids = [0];
      const marks = group.map((word, index) => {
        if (index > 0) ids.push(idOf(' '));
        ids.push(...word.lead.map(idOf));
        const mark = { token: ids.length, location: word.location, length: word.length };
        ids.push(...word.body.map(idOf), ...word.trail.map(idOf));
        return mark;
      });
      ids.push(0);
      return { ids, marks };
    }),
  };
};

/** Each mark's start, modelled: 600 samples for each frame of the ids before the mark's token. */
const modelStarts = (chunk: Chunk, durations: ReadonlyArray<number>) => {
  if (durations.length !== chunk.ids.length) return 'None';
  if (!durations.every((frames) => Number.isInteger(frames) && frames > 0)) return 'None';
  return JSON.stringify(
    chunk.marks.map((mark) => ({
      sample: durations.slice(0, mark.token).reduce((a, b) => a + b, 0) * 600,
      location: mark.location,
      length: mark.length,
    })),
  );
};

const shown = <A>(option: Option.Option<A>): string =>
  Option.match(option, { onNone: () => 'None', onSome: (value) => JSON.stringify(value) });
const modelShown = (modelled: Modelled): string =>
  modelled._tag === 'None' ? 'None' : JSON.stringify({ chunks: modelled.chunks });

const chunksOf = (text: string, vocab = VOCAB): ReadonlyArray<Chunk> =>
  Option.match(planOf(WORDS, vocab, text), { onNone: () => [], onSome: (plan) => plan.chunks });
/** The text's first chunk, or an empty one when it plans none, so the expectations below name the miss. */
const firstChunk = (text: string): Chunk => chunksOf(text)[0] ?? { ids: [], marks: [] };

/** mulberry32, seeded, so a red run names its seed. */
const generator = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const SEED = 2_611;
const KEYS = [...WORDS.keys()].filter((key) => key !== 'bad');
const SHORT_KEYS = KEYS.filter((key) => !/^[xy]\d+$/u.test(key));
const EDGES = [
  '',
  '',
  '',
  ',',
  '.',
  ':',
  ';',
  '?',
  '!',
  '(',
  ')',
  "'",
  '’',
  '-',
  ',)',
  '.)',
  "';",
  '--;',
  '(?',
  '😀',
  '“',
  '”,',
];
const BLANKS = [' ', ' ', ' ', '  ', '\n', '\t', ' \n ', '\u00a0'];

const generatedTexts = (seed: number, count: number) => {
  const random = generator(seed);
  const pick = <A>(list: ReadonlyArray<A>): A => list[Math.floor(random() * list.length)] as A;
  return Array.from({ length: count }, () => {
    const kind = random();
    if (kind < 0.04) return pick(['', ' ', '\n\t', ', ; :', '-- ()', '😀 ’']);
    const words = 1 + Math.floor(random() * (kind < 0.5 ? 8 : 60));
    const parts = Array.from({ length: words }, () => {
      const roll = random();
      const key =
        roll < 0.02 ? 'Zzqxv' : roll < 0.03 ? 'bad' : roll < 0.35 ? pick(KEYS) : pick(SHORT_KEYS);
      return `${pick(EDGES)}${key}${pick(EDGES)}`;
    });
    return `${random() < 0.2 ? pick(BLANKS) : ''}${parts.join(pick(BLANKS))}${random() < 0.2 ? pick(BLANKS) : ''}`;
  });
};

describe('planOf, against the model', () => {
  it('plans seeded texts of the lexicon’s words, edges and blanks as the model does', () => {
    const texts = generatedTexts(SEED, 2_000);
    const wrong = texts.filter(
      (text) => shown(planOf(WORDS, VOCAB, text)) !== modelShown(modelPlan(WORDS, VOCAB, text)),
    );
    const planned = texts.map((text) => modelPlan(WORDS, VOCAB, text));
    const some = planned.filter((each) => each._tag === 'Some');
    const multi = some.filter((each) => each._tag === 'Some' && each.chunks.length > 1).length;
    expect({ seed: SEED, wrong: wrong.slice(0, 3) }).toEqual({ seed: SEED, wrong: [] });
    expect(some.length).toBeGreaterThan(texts.length / 3);
    expect(some.length).toBeLessThan(texts.length);
    expect(multi).toBeGreaterThan(50);
  });

  it('plans seeded texts as the model does under a vocab without a spoken edge', () => {
    const vocab = withoutSymbol('?');
    const texts = generatedTexts(SEED + 1, 500);
    const wrong = texts.filter(
      (text) => shown(planOf(WORDS, vocab, text)) !== modelShown(modelPlan(WORDS, vocab, text)),
    );
    expect(wrong.slice(0, 3)).toEqual([]);
  });
});

describe('planOf, by hand', () => {
  it('fixes the cap at 200 symbols and the frame at 600 samples', () => {
    expect([CHUNK_CAP, SAMPLES_PER_FRAME]).toEqual([200, 600]);
  });

  it('answers none for no words, an unknown key, an out-of-vocab symbol and a word over the cap', () => {
    const none = [
      '',
      '   ',
      '\n\t',
      ', ; :',
      '-- () 😀',
      'LORD Zzqxv thee',
      'LORD bad',
      'x201',
      '(x200',
      'x200.',
    ];
    expect(none.map((text) => shown(planOf(WORDS, VOCAB, text)))).toEqual(none.map(() => 'None'));
    expect(shown(planOf(WORDS, withoutSymbol('('), 'thee (LORD'))).toBe('None');
    expect(shown(planOf(WORDS, withoutSymbol('?'), 'LORD?'))).toBe('None');
    expect(shown(planOf(WORDS, withoutSymbol('?'), 'LORD;'))).not.toBe('None');
  });

  it('gives a word of exactly the cap its own chunk', () => {
    expect(chunksOf('x200').map((chunk) => chunk.ids.length)).toEqual([202]);
    expect(chunksOf('x199.').map((chunk) => chunk.ids.length)).toEqual([202]);
  });

  it('speaks a word’s parentheses and marks it at its first phoneme, after the lead', () => {
    const chunk = firstChunk('thee (LORD), O');
    const spoken = ['ð', 'ˈ', 'i', ' ', '(', 'l', 'ˈ', 'ɔ', 'ɹ', 'd', ')', ',', ' ', 'ˈ', 'O'];
    expect(chunk.ids).toEqual([0, ...spoken.map((symbol) => VOCAB.get(symbol) ?? -1), 0]);
    expect(chunk.marks).toEqual([
      { token: 1, location: 0, length: 4 },
      { token: 6, location: 5, length: 7 },
      { token: 14, location: 13, length: 1 },
    ]);
  });

  it('marks the whole run, edges included, in UTF-16 units past astral and curly characters', () => {
    const text = '😀 “𝔸men,” ’Lord’s’ big';
    const chunk = firstChunk(text);
    expect(
      chunk.marks.map((mark) => text.slice(mark.location, mark.location + mark.length)),
    ).toEqual(['“𝔸men,”', '’Lord’s’', 'big']);
    expect(chunk.marks.map((mark) => mark.location)).toEqual([3, 12, 21]);
    expect(chunk.marks.map((mark) => mark.token)).toEqual([1, 8, 15]);
  });

  it('keeps a clause of exactly 200 symbols whole, and splits one of 201 between its words', () => {
    expect(chunksOf('x100 x99').map((chunk) => chunk.marks.length)).toEqual([2]);
    expect(chunksOf('x100 x100').map((chunk) => chunk.marks.length)).toEqual([1, 1]);
    expect(chunksOf('x100 x50 x60').map((chunk) => chunk.marks.length)).toEqual([2, 1]);
    expect(chunksOf('x20, x100 x50 x60').map((chunk) => chunk.marks.length)).toEqual([3, 1]);
  });

  it('counts symbols in code points, not UTF-16 units', () => {
    expect(chunksOf('y100 x99').map((chunk) => chunk.marks.length)).toEqual([2]);
    expect(chunksOf('y100 y99').map((chunk) => chunk.marks.length)).toEqual([2]);
    expect(chunksOf('y100 y100').map((chunk) => chunk.marks.length)).toEqual([1, 1]);
    expect(chunksOf('y200').map((chunk) => chunk.ids.length)).toEqual([202]);
  });

  it('packs clauses while they and the joining space stay within 200: at 199, 200 and 201', () => {
    expect(chunksOf('x50, x146.').map((chunk) => chunk.marks.length)).toEqual([2]);
    expect(chunksOf('x50, x147.').map((chunk) => chunk.marks.length)).toEqual([2]);
    expect(chunksOf('x50, x148.').map((chunk) => chunk.marks.length)).toEqual([1, 1]);
    expect(chunksOf('x50, x100 x47').map((chunk) => chunk.marks.length)).toEqual([3]);
  });

  it('ends a clause at a comma, so the next clause starts a chunk rather than filling the last', () => {
    expect(chunksOf('x100, x60 x60').map((chunk) => chunk.marks.length)).toEqual([1, 2]);
    expect(chunksOf('x100; x60 x60').map((chunk) => chunk.marks.length)).toEqual([1, 2]);
    expect(chunksOf('(x100) x60 x60').map((chunk) => chunk.marks.length)).toEqual([2, 1]);
  });
});

describe('startsOf', () => {
  const chunks = generatedTexts(SEED + 2, 400).flatMap((text) => chunksOf(text));

  it('starts each word at the frames before its first phoneme, for seeded durations', () => {
    const random = generator(SEED + 3);
    const wrong = chunks.filter((chunk) => {
      const durations = chunk.ids.map(() => 1 + Math.floor(random() * 40));
      return shown(startsOf(chunk, durations)) !== modelStarts(chunk, durations);
    });
    expect(chunks.length).toBeGreaterThan(200);
    expect(wrong.length).toBe(0);
  });

  it('counts the lead’s frames and not the word’s own first phoneme', () => {
    const chunk = firstChunk('thee (LORD)');
    const durations = chunk.ids.map((_, index) => index + 1);
    expect(shown(startsOf(chunk, durations))).toBe(
      JSON.stringify([
        { sample: 1 * 600, location: 0, length: 4 },
        { sample: (1 + 2 + 3 + 4 + 5 + 6) * 600, location: 5, length: 6 },
      ]),
    );
  });

  it('answers none for durations that do not fit the chunk', () => {
    const chunk = firstChunk('thee (LORD), O');
    expect(chunk.ids.length).toBe(17);
    const fit = chunk.ids.map(() => 2);
    const at = (index: number, frames: number) => fit.with(index, frames);
    const misfits = [
      fit.slice(1),
      [...fit, 2],
      [],
      at(0, 0),
      at(3, 0),
      at(3, -2),
      at(3, 1.5),
      at(3, Number.NaN),
      at(3, Number.POSITIVE_INFINITY),
    ];
    expect(misfits.map((durations) => shown(startsOf(chunk, durations)))).toEqual(
      misfits.map(() => 'None'),
    );
    expect(shown(startsOf(chunk, fit))).toBe(modelStarts(chunk, fit));
  });
});
