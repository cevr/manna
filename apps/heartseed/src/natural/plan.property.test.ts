/* oxlint-disable effect/noGlobals, effect/noTernary, effect/noNullish -- the model reads its plain maps and names a wrong plan by its JSON, and the generator writes its choices as plain branches. */

/**
 * A piece's natural-voice plan and its word starts against an independent
 * model written here, over a small hand-built lexicon and vocab: seeded
 * texts of its words with edge characters, runs of blanks, unknown words
 * (case variants of listed keys among them), line breaks and blank texts,
 * with floors on every rest and on breaks inside a phrase; then each rule's
 * edges by hand: one phrase a chunk however short, the cap at 200 and 201
 * for a phrase and a word, ";" and ":" sent as ".", each rest by its
 * ending and 0 after the last chunk or inside a phrase, a key looked up as
 * written, symbols counted in code points, marks after a spoken lead and at
 * the whole run in UTF-16, and durations that do not fit a chunk. Then a
 * chunk's cut (`cutOf`, 20 ms kept each side of its audible span, all of it
 * when nothing is heard) and its starts moved into it (`startsWithin`)
 * against a model, over seeded bounds with floors on a silent chunk, a cut
 * at either edge of the audio, one inside it and a clamped start.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import {
  CHUNK_CAP,
  cutOf,
  EDGE_KEEP,
  planOf,
  RESTS,
  SAMPLES_PER_FRAME,
  startsOf,
  startsWithin,
  type Chunk,
} from './plan';

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
const PHRASE_END = ',.:;?!';
/** The rests the owner chose, in ms, at 24 samples a ms. */
const REST = { comma: 300 * 24, clause: 550 * 24, sentence: 800 * 24, verse: 1100 * 24 };
/** A spoken edge character as it is sent: `;` and `:` as a full stop. */
const sent = (char: string) => (char === ';' || char === ':' ? '.' : char);

interface ModelWord {
  readonly location: number;
  readonly length: number;
  readonly end: number;
  readonly lead: ReadonlyArray<string>;
  readonly body: ReadonlyArray<string>;
  readonly trail: ReadonlyArray<string>;
  readonly mark: string | undefined;
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

/** The text's words as spoken, modelled, or none when one is unknown, speaks a symbol not in `vocab`, or speaks over 200. */
const modelWords = (
  words: ReadonlyMap<string, string>,
  vocab: ReadonlyMap<string, number>,
  text: string,
): Array<ModelWord> | undefined => {
  const said: Array<ModelWord> = [];
  for (const [start, end] of runsOf(text)) {
    const points = Array.from(text.slice(start, end));
    const first = points.findIndex(isWordChar);
    if (first < 0) continue;
    const last = points.findLastIndex(isWordChar);
    const phonemes = words.get(points.slice(first, last + 1).join(''));
    if (phonemes === undefined) return undefined;
    const trail = points.slice(last + 1);
    const word = {
      location: start,
      length: end - start,
      end,
      lead: points
        .slice(0, first)
        .filter((char) => SPOKEN_EDGE.includes(char))
        .map(sent),
      body: Array.from(phonemes),
      trail: trail.filter((char) => SPOKEN_EDGE.includes(char)).map(sent),
      mark: trail.filter((char) => PHRASE_END.includes(char)).at(-1),
    };
    const symbols = [...word.lead, ...word.body, ...word.trail];
    if (symbols.some((symbol) => !vocab.has(symbol))) return undefined;
    if (symbols.length > 200) return undefined;
    said.push(word);
  }
  return said;
};

/** The rule, modelled: words, spoken symbols, phrases, greedy chunks within a phrase, ids, marks and rests. */
const modelPlan = (
  words: ReadonlyMap<string, string>,
  vocab: ReadonlyMap<string, number>,
  text: string,
): Modelled => {
  const said = modelWords(words, vocab, text) ?? [];
  if (said.length === 0) return NONE;
  const sizeOfWord = (word: ModelWord) => word.lead.length + word.body.length + word.trail.length;
  const sizeOfAll = (group: ReadonlyArray<ModelWord>) =>
    group.map(sizeOfWord).reduce((a, b) => a + b + 1, 0) - 1;
  const lineAfter = (index: number) => {
    const next = said[index + 1];
    return next !== undefined && text.slice(said[index]?.end, next.location).includes('\n');
  };
  const restAfter = (index: number) => {
    if (index === said.length - 1) return 0;
    if (lineAfter(index)) return REST.verse;
    const mark = said[index]?.mark;
    if (mark === undefined) return 0;
    if (mark === ',') return REST.comma;
    if (mark === ';' || mark === ':') return REST.clause;
    return REST.sentence;
  };
  const phrases: Array<Array<number>> = [[]];
  for (const [index, word] of said.entries()) {
    phrases.at(-1)?.push(index);
    if (word.mark !== undefined || lineAfter(index)) phrases.push([]);
  }
  const groups: Array<{ readonly words: Array<ModelWord>; rest: number }> = [];
  for (const phrase of phrases.filter((each) => each.length > 0)) {
    const own: Array<Array<number>> = [[]];
    for (const index of phrase) {
      const open = own.at(-1) ?? [];
      if (
        open.length === 0 ||
        sizeOfAll([...open, index].map((at) => said[at] as ModelWord)) <= 200
      )
        open.push(index);
      else own.push([index]);
    }
    for (const [at, group] of own.entries()) {
      groups.push({
        words: group.map((index) => said[index] as ModelWord),
        rest: at === own.length - 1 ? restAfter(group.at(-1) ?? -1) : 0,
      });
    }
  }
  const idOf = (symbol: string) => vocab.get(symbol) ?? Number.NaN;
  return {
    _tag: 'Some',
    chunks: groups.map((group) => {
      const ids = [0];
      const marks = group.words.map((word, index) => {
        if (index > 0) ids.push(idOf(' '));
        ids.push(...word.lead.map(idOf));
        const mark = { token: ids.length, location: word.location, length: word.length };
        ids.push(...word.body.map(idOf), ...word.trail.map(idOf));
        return mark;
      });
      ids.push(0);
      return { ids, marks, rest: group.rest };
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
const firstChunk = (text: string): Chunk => chunksOf(text)[0] ?? { ids: [], marks: [], rest: -1 };
const restsOf = (text: string, vocab = VOCAB) => chunksOf(text, vocab).map((chunk) => chunk.rest);
const sizesOf = (text: string) => chunksOf(text).map((chunk) => chunk.marks.length);

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
/** Keys that differ from a listed key only by case, none of them listed: a key is looked up exactly as written. */
const CASE_VARIANTS = [
  'Thee',
  'THEE',
  'lord',
  'Lord',
  'o',
  'Big',
  'BIG',
  'éli',
  'ÉLI',
  'LORD’S',
  'X12',
  'Y7',
];
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
        roll < 0.02
          ? 'Zzqxv'
          : roll < 0.03
            ? 'bad'
            : roll < 0.04
              ? pick(CASE_VARIANTS)
              : roll < 0.35
                ? pick(KEYS)
                : pick(SHORT_KEYS);
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
    const rests = new Map<number, number>();
    let inner = 0;
    for (const each of some) {
      if (each._tag !== 'Some') continue;
      for (const chunk of each.chunks) rests.set(chunk.rest, (rests.get(chunk.rest) ?? 0) + 1);
      inner += each.chunks.slice(0, -1).filter((chunk) => chunk.rest === 0).length;
    }
    expect({ seed: SEED, wrong: wrong.slice(0, 3) }).toEqual({ seed: SEED, wrong: [] });
    expect(some.length).toBeGreaterThan(texts.length / 3);
    expect(some.length).toBeLessThan(texts.length);
    expect(multi).toBeGreaterThan(50);
    expect([...Object.values(REST), 0].map((rest) => rests.get(rest) ?? 0)).toSatisfy((counts) =>
      counts.every((count) => count > 20),
    );
    expect(inner).toBeGreaterThan(5);
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
  it('fixes the cap at 200 symbols, the frame at 600 samples and the rests the owner chose', () => {
    expect([CHUNK_CAP, SAMPLES_PER_FRAME]).toEqual([200, 600]);
    expect(REST).toEqual({ ...RESTS });
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
    expect(shown(planOf(WORDS, withoutSymbol('.'), 'LORD;'))).toBe('None');
    expect(shown(planOf(WORDS, withoutSymbol('.'), ':LORD'))).toBe('None');
  });

  it('sends a spoken ";" or ":", lead or trail, as the id of "."', () => {
    const stop = VOCAB.get('.') ?? -1;
    for (const text of ['O;', 'O:', ':O', ';O.', 'O.']) {
      expect(firstChunk(text).ids.filter((id) => id === stop).length).toBeGreaterThan(0);
      expect(firstChunk(text).ids).not.toContain(VOCAB.get(';'));
      expect(firstChunk(text).ids).not.toContain(VOCAB.get(':'));
    }
    expect(shown(planOf(WORDS, withoutSymbol(';'), 'O; thee'))).toBe(
      shown(planOf(WORDS, VOCAB, 'O. thee')).replace('"rest":19200', '"rest":13200'),
    );
  });

  it('rests after a phrase by its ending: comma, ";" or ":", a sentence, a line break', () => {
    expect(restsOf('x1, x2; x3: x4. x5? x6! x7')).toEqual([
      REST.comma,
      REST.clause,
      REST.clause,
      REST.sentence,
      REST.sentence,
      REST.sentence,
      0,
    ]);
    expect(restsOf('x1\nx2')).toEqual([REST.verse, 0]);
    expect(restsOf('x1, \n x2')).toEqual([REST.verse, 0]);
    expect(restsOf('x1 — \n¶ x2')).toEqual([REST.verse, 0]);
    expect(restsOf('x1;) x2')).toEqual([REST.clause, 0]);
    expect(restsOf('x1,: x2')).toEqual([REST.clause, 0]);
    expect(restsOf('x1:, x2')).toEqual([REST.comma, 0]);
    expect(restsOf('(x1) x2')).toEqual([0]);
    expect(restsOf('x1 — x2 ¶ x3')).toEqual([0]);
  });

  it('rests 0 after the text’s last chunk and inside a phrase over the cap', () => {
    expect(restsOf('x1.')).toEqual([0]);
    expect(restsOf('x1.\n')).toEqual([0]);
    expect(restsOf('x1, x2,')).toEqual([REST.comma, 0]);
    expect(restsOf('x150 x60, x199. x1')).toEqual([0, REST.comma, REST.sentence, 0]);
  });

  it('looks a key up exactly as written: a case variant of a listed key plans none', () => {
    expect(CASE_VARIANTS.filter((key) => WORDS.has(key))).toEqual([]);
    expect(
      CASE_VARIANTS.filter(
        (key) => !KEYS.some((listed) => listed.toLowerCase() === key.toLowerCase()),
      ),
    ).toEqual([]);
    const none = [...CASE_VARIANTS, 'O lord', 'LORD Thee', '(Thee),', 'thee THEE'];
    expect(none.map((text) => shown(planOf(WORDS, VOCAB, text)))).toEqual(none.map(() => 'None'));
    expect(shown(planOf(WORDS, VOCAB, 'O LORD thee'))).not.toBe('None');
  });

  it('gives a word of exactly the cap its own chunk', () => {
    expect(chunksOf('x200').map((chunk) => chunk.ids.length)).toEqual([202]);
    expect(chunksOf('x199.').map((chunk) => chunk.ids.length)).toEqual([202]);
  });

  it('speaks a word’s parentheses and marks it at its first phoneme, after the lead', () => {
    const [chunk, after] = chunksOf('thee (LORD), O');
    const spoken = ['ð', 'ˈ', 'i', ' ', '(', 'l', 'ˈ', 'ɔ', 'ɹ', 'd', ')', ','];
    expect(chunk?.ids).toEqual([0, ...spoken.map((symbol) => VOCAB.get(symbol) ?? -1), 0]);
    expect(chunk?.marks).toEqual([
      { token: 1, location: 0, length: 4 },
      { token: 6, location: 5, length: 7 },
    ]);
    expect(after?.ids).toEqual([0, VOCAB.get('ˈ') ?? -1, VOCAB.get('O') ?? -1, 0]);
    expect(after?.marks).toEqual([{ token: 1, location: 13, length: 1 }]);
  });

  it('marks the whole run, edges included, in UTF-16 units past astral and curly characters', () => {
    const text = '😀 “𝔸men,” ’Lord’s’ big';
    const marks = chunksOf(text).flatMap((chunk) => chunk.marks);
    expect(marks.map((mark) => text.slice(mark.location, mark.location + mark.length))).toEqual([
      '“𝔸men,”',
      '’Lord’s’',
      'big',
    ]);
    expect(marks.map((mark) => mark.location)).toEqual([3, 12, 21]);
    expect(marks.map((mark) => mark.token)).toEqual([1, 1, 8]);
  });

  it('keeps a phrase of exactly 200 symbols whole, and splits one of 201 between its words', () => {
    expect(sizesOf('x100 x99')).toEqual([2]);
    expect(sizesOf('x100 x100')).toEqual([1, 1]);
    expect(sizesOf('x100 x50 x60')).toEqual([2, 1]);
    expect(sizesOf('x20, x100 x50 x60')).toEqual([1, 2, 1]);
  });

  it('counts symbols in code points, not UTF-16 units', () => {
    expect(chunksOf('y100 x99').map((chunk) => chunk.marks.length)).toEqual([2]);
    expect(chunksOf('y100 y99').map((chunk) => chunk.marks.length)).toEqual([2]);
    expect(chunksOf('y100 y100').map((chunk) => chunk.marks.length)).toEqual([1, 1]);
    expect(chunksOf('y200').map((chunk) => chunk.ids.length)).toEqual([202]);
  });

  it('never joins two phrases in a chunk, however short', () => {
    expect(sizesOf('x50, x146.')).toEqual([1, 1]);
    expect(sizesOf('x1, x1; x1: x1. x1')).toEqual([1, 1, 1, 1, 1]);
    expect(sizesOf('x50, x100 x47')).toEqual([1, 2]);
    expect(sizesOf('x1\nx1 x1')).toEqual([1, 2]);
  });

  it('ends a phrase at a mark or a line break, not at a parenthesis or a dash', () => {
    expect(sizesOf('x100, x60 x60')).toEqual([1, 2]);
    expect(sizesOf('x100; x60 x60')).toEqual([1, 2]);
    expect(sizesOf('(x100) x60 x60')).toEqual([2, 1]);
    expect(sizesOf('x1 — x2 ¶ x3')).toEqual([3]);
    expect(sizesOf('x1 \n x2 x3')).toEqual([1, 2]);
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
    const chunk = firstChunk('thee (LORD) O');
    expect(chunk.ids.length).toBe(16);
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

/** The margin kept each side of the audible span: 20 ms at 24 samples a ms. */
const MARGIN = 20 * 24;

/** The model's cut: the audible span widened by the margin and kept inside the audio, or all of it when nothing is audible. */
const modelCut = (samples: number, first: number, last: number) => {
  if (last < first) return { from: 0, to: samples };
  const from = first < MARGIN ? 0 : first - MARGIN;
  const end = last + MARGIN;
  return { from, to: end >= samples ? samples : end + 1 };
};

/** Seeded bounds: audio of 0 to 40,000 samples (short ones often), a span anywhere in it or none, and starts across it. */
const generatedBounds = (seed: number, count: number) => {
  const random = generator(seed);
  return Array.from({ length: count }, () => {
    const samples = random() < 0.3 ? Math.floor(random() * 1_500) : Math.floor(random() * 40_000);
    const silent = samples === 0 || random() < 0.15;
    const first = silent ? samples : Math.floor(random() * samples);
    const last = silent ? -1 : first + Math.floor(random() * (samples - first));
    const starts = Array.from({ length: Math.floor(random() * 5) }, (_, index) => ({
      sample: Math.floor(random() * (samples + 1)),
      location: index * 4,
      length: 3,
    }));
    return { samples, first, last, starts };
  });
};

describe('cutOf and startsWithin, against the model', () => {
  it('cuts seeded bounds and moves their starts as the model does', () => {
    const bounds = generatedBounds(SEED + 4, 5_000);
    const tally = { silent: 0, front: 0, back: 0, inside: 0, clamped: 0 };
    const wrong = bounds.filter(({ samples, first, last, starts }) => {
      const cut = modelCut(samples, first, last);
      if (last < first) tally.silent++;
      else {
        if (cut.from === 0) tally.front++;
        if (cut.to === samples) tally.back++;
        if (cut.from > 0 && cut.to < samples) tally.inside++;
      }
      const moved = starts.map((start) => {
        const within = start.sample - cut.from;
        const sample = within < 0 ? 0 : within > cut.to - cut.from ? cut.to - cut.from : within;
        if (sample !== within) tally.clamped++;
        return { ...start, sample };
      });
      const got = cutOf(samples, first, last);
      return (
        JSON.stringify(got) !== JSON.stringify(cut) ||
        JSON.stringify(startsWithin(starts, got)) !== JSON.stringify(moved)
      );
    });
    expect(wrong.slice(0, 3)).toEqual([]);
    expect(tally.silent).toBeGreaterThanOrEqual(400);
    expect(tally.front).toBeGreaterThanOrEqual(400);
    expect(tally.back).toBeGreaterThanOrEqual(400);
    expect(tally.inside).toBeGreaterThanOrEqual(1_000);
    expect(tally.clamped).toBeGreaterThanOrEqual(1_000);
  });

  it('keeps 480 samples each side, the audio’s own edges, and all of it when nothing is heard', () => {
    expect(EDGE_KEEP).toBe(480);
    expect(cutOf(10_000, 1_000, 2_000)).toEqual({ from: 520, to: 2_481 });
    expect(cutOf(10_000, 480, 9_519)).toEqual({ from: 0, to: 10_000 });
    expect(cutOf(10_000, 481, 9_518)).toEqual({ from: 1, to: 9_999 });
    expect(cutOf(10_000, 0, 9_999)).toEqual({ from: 0, to: 10_000 });
    expect(cutOf(10_000, 5_000, 5_000)).toEqual({ from: 4_520, to: 5_481 });
    expect(cutOf(10_000, 10_000, -1)).toEqual({ from: 0, to: 10_000 });
    expect(cutOf(0, 0, -1)).toEqual({ from: 0, to: 0 });
  });

  it('moves a start by the cut, a trimmed lead to 0 and one past the end to the cut’s length', () => {
    const start = (sample: number) => ({ sample, location: 2, length: 5 });
    const cut = { from: 520, to: 2_481 };
    expect(
      startsWithin([start(1_000), start(100), start(520), start(2_481), start(3_000)], cut),
    ).toEqual([start(480), start(0), start(0), start(1_961), start(1_961)]);
  });
});
