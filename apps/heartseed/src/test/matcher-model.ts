/* oxlint-disable effect/noTernary, effect/noNullish -- the model writes the spec's rules out as plain branches, apart from the matcher's Option code, so the two cannot share a mistake; the view it builds holds the contract's nulls. */

/**
 * An independent model of the word matcher for its tests: a ledger of the
 * accepted transcript, aligned by trying every monotone matching of short
 * word lists. It shares no code with the matcher. Its equivalences are
 * given to it as phrase pairs (the closed spelling table, written out here,
 * and numeric phrases spelled from known values), never parsed.
 */

export type ModelCue = 'none' | 'initials' | 'full';
export type ModelWord = { text: string; start: number; end: number };
export type ModelCommand =
  | { type: 'recognition'; revision: number; finalWords: ModelWord[]; tentativeWords: ModelWord[] }
  | { type: 'peek'; index: number }
  | { type: 'finish' };
export type ModelMark = {
  index: number;
  status: 'pending' | 'tentative' | 'matched' | 'miss' | 'peek';
  time: { start: number; end: number } | null;
  revealed: string | null;
};
export type ModelView = {
  marks: ModelMark[];
  extraWordCount: number;
  peekCount: number;
  suggestedGrade: 1 | 2 | 3 | null;
  finished: boolean;
};
export type Pair = readonly [string, string];

/** The spelling table the spec fixes, pair by pair. */
export const SPELLING_PAIRS: readonly Pair[] = [
  ['shew', 'show'],
  ['shewed', 'showed'],
  ['sheweth', 'showeth'],
  ['shewing', 'showing'],
  ['alway', 'always'],
  ['throughly', 'thoroughly'],
  ['subtil', 'subtle'],
  ['subtilly', 'subtly'],
  ['publick', 'public'],
  ['musick', 'music'],
  ['astonied', 'astonished'],
  ['ensample', 'example'],
  ['ensamples', 'examples'],
  ['stablish', 'establish'],
  ['stablished', 'established'],
  ['intreat', 'entreat'],
  ['intreated', 'entreated'],
  ['o', 'oh'],
  ['leadeth', 'ledeth'],
  ['for ever', 'forever'],
  ['ever more', 'evermore'],
  ["name's sake", 'namesake'],
];

const hasWord = (text: string) => /[\p{L}\p{N}]/u.test(text);
const runs = (text: string) => text.split(/\s+/u).filter(hasWord);
const fold = (text: string) => text.toLocaleLowerCase('und').replace(/[^\p{L}\p{N}]/gu, '');
const phrase = (words: readonly string[]) => words.map(fold).join('|');

type Link = { source: number[]; spoken: number[] };
type Best = { links: Link[]; hits: number; used: number; order: number[] };

const before = (a: readonly number[], b: readonly number[]) => {
  const index = a.findIndex((value, at) => value !== b[at]);
  return index !== -1 && (a[index] ?? 0) < (b[index] ?? 0);
};

/** Tries every monotone chain of links and keeps the best by the spec's three keys. */
const bestMatching = (
  source: readonly string[],
  spoken: readonly string[],
  pairs: readonly Pair[],
): Best => {
  const equal = new Set(
    pairs.flatMap(([a, b]) => [
      `${phrase(runs(a))}=${phrase(runs(b))}`,
      `${phrase(runs(b))}=${phrase(runs(a))}`,
    ]),
  );
  const links: Link[] = [];
  for (let s0 = 0; s0 < source.length; s0++) {
    for (let s1 = s0 + 1; s1 <= source.length; s1++) {
      for (let t0 = 0; t0 < spoken.length; t0++) {
        for (let t1 = t0 + 1; t1 <= spoken.length; t1++) {
          const left = phrase(source.slice(s0, s1));
          const right = phrase(spoken.slice(t0, t1));
          const single = s1 - s0 === 1 && t1 - t0 === 1 && left === right;
          if (single || equal.has(`${left}=${right}`)) {
            links.push({
              source: Array.from({ length: s1 - s0 }, (_, i) => s0 + i),
              spoken: Array.from({ length: t1 - t0 }, (_, i) => t0 + i),
            });
          }
        }
      }
    }
  }
  let best: Best = { links: [], hits: 0, used: 0, order: [] };
  const walk = (chain: Link[], sourceFrom: number, spokenFrom: number) => {
    const hits = chain.reduce((n, link) => n + link.source.length, 0);
    const used = chain.reduce((n, link) => n + link.spoken.length, 0);
    const order = chain.flatMap((link) =>
      link.source.flatMap((index) => [index, link.spoken[0] ?? 0, link.spoken.at(-1) ?? 0]),
    );
    const better =
      hits > best.hits ||
      (hits === best.hits &&
        (used > best.used || (used === best.used && before(order, best.order))));
    if (better) best = { links: chain, hits, used, order };
    for (const link of links) {
      if ((link.source[0] ?? -1) >= sourceFrom && (link.spoken[0] ?? -1) >= spokenFrom) {
        walk([...chain, link], (link.source.at(-1) ?? 0) + 1, (link.spoken.at(-1) ?? 0) + 1);
      }
    }
  };
  walk([], 0, 0);
  return best;
};

const sameWords = (a: readonly ModelWord[], b: readonly ModelWord[]) =>
  a.every(
    (word, i) => word.text === b[i]?.text && word.start === b[i]?.start && word.end === b[i]?.end,
  );

const wordOk = (word: ModelWord, previous: ModelWord | undefined) =>
  hasWord(word.text) &&
  !/\s/u.test(word.text) &&
  Number.isFinite(word.start) &&
  Number.isFinite(word.end) &&
  word.start >= 0 &&
  word.end >= word.start &&
  (previous === undefined || word.start >= previous.start);

/** Replays commands one at a time; `view()` gives what the matcher must show now. */
export class MatcherModel {
  readonly words: string[];
  private final: ModelWord[] = [];
  private tentative: ModelWord[] = [];
  private revision = -1;
  private done = false;
  private readonly helped: number[] = [];

  constructor(
    verse: string,
    private readonly cue: ModelCue = 'none',
    private readonly pairs: readonly Pair[] = SPELLING_PAIRS,
  ) {
    this.words = runs(verse);
  }

  view(): ModelView {
    const final = bestMatching(
      this.words,
      this.final.map((w) => w.text),
      this.pairs,
    );
    const finalAt = new Map(
      final.links.flatMap((link) => link.source.map((i) => [i, link] as const)),
    );
    const reached = Math.max(-1, ...finalAt.keys()) + 1;
    const rest = this.words.slice(reached);
    const guess = bestMatching(
      rest,
      this.tentative.map((w) => w.text),
      this.pairs,
    );
    const guessAt = new Map(
      guess.links.flatMap((link) => link.source.map((i) => [i + reached, link] as const)),
    );
    const span = (link: Link, words: ModelWord[]) => ({
      start: words[link.spoken[0] ?? 0]?.start ?? -1,
      end: words[link.spoken.at(-1) ?? 0]?.end ?? -1,
    });
    const marks = this.words.map((text, index): ModelMark => {
      const heard = finalAt.get(index);
      if (heard) return { index, status: 'matched', time: span(heard, this.final), revealed: null };
      const maybe = guessAt.get(index);
      if (maybe)
        return { index, status: 'tentative', time: span(maybe, this.tentative), revealed: null };
      if (!this.done && index >= reached)
        return { index, status: 'pending', time: null, revealed: null };
      const shown = this.helped.includes(index);
      return { index, status: shown ? 'peek' : 'miss', time: null, revealed: shown ? text : null };
    });
    const total = this.words.length;
    const short = total - final.hits;
    const extra = this.final.length - final.used;
    let grade: 1 | 2 | 3 = 3;
    if (total === 0 || final.hits === 0 || short * 10 > total) grade = 1;
    else if (short > 0 || extra > 0 || this.helped.length > 0 || this.cue !== 'none') grade = 2;
    return {
      marks,
      extraWordCount: extra,
      peekCount: this.helped.length,
      suggestedGrade: this.done ? grade : null,
      finished: this.done,
    };
  }

  step(command: ModelCommand): ModelView {
    if (command.type === 'finish' && !this.done) {
      this.done = true;
      this.tentative = [];
    }
    if (command.type === 'peek') {
      const now = this.view().marks.find((mark) => mark.index === command.index);
      if (now?.status === 'miss' && !this.helped.includes(command.index))
        this.helped.push(command.index);
    }
    if (command.type === 'recognition' && !this.done) {
      const all = [...command.finalWords, ...command.tentativeWords];
      const ok =
        Number.isSafeInteger(command.revision) &&
        command.revision >= 0 &&
        command.revision > this.revision &&
        command.finalWords.length >= this.final.length &&
        sameWords(this.final, command.finalWords) &&
        all.every((word, i) => wordOk(word, all[i - 1]));
      if (ok) {
        this.revision = command.revision;
        this.final = command.finalWords.map((w) => ({ ...w }));
        this.tentative = command.tentativeWords.map((w) => ({ ...w }));
      }
    }
    return this.view();
  }
}

/** Words spoken one after another, 100 ms apart, each lasting 80 ms, from `at`. */
export const said = (text: string, at = 0): ModelWord[] =>
  runs(text).map((word, i) => ({ text: word, start: at + i * 100, end: at + i * 100 + 80 }));

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEENS = [
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const DECADES = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];
const POWERS = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion'];

/** How a value is spelled: plain, with `and` before a last part under a hundred, or with hyphenated tens. */
export type Spelling = 'plain' | 'and' | 'hyphen';

const underHundred = (n: number, style: Spelling) => {
  if (n < 10) return ONES[n] ?? '';
  if (n < 20) return TEENS[n - 10] ?? '';
  const tens = DECADES[Math.floor(n / 10)] ?? '';
  const unit = ONES[n % 10] ?? '';
  if (!unit) return tens;
  return style === 'hyphen' ? `${tens}-${unit}` : `${tens} ${unit}`;
};

const underThousand = (n: number, style: Spelling) => {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds ? `${ONES[hundreds]} hundred` : '';
  const tail = rest ? underHundred(rest, style) : '';
  if (head && tail) return `${head}${style === 'and' ? ' and' : ''} ${tail}`;
  return head || tail;
};

/** A value's English words, from its decimal digits in groups of three; never parsed back. */
export const spell = (value: number, style: Spelling = 'plain'): string => {
  if (value === 0) return 'zero';
  const digits = String(value);
  const groups: number[] = [];
  for (let end = digits.length; end > 0; end -= 3)
    groups.unshift(Number(digits.slice(Math.max(0, end - 3), end)));
  const parts = groups.flatMap((group, i) => {
    const power = POWERS[groups.length - 1 - i] ?? '';
    return group ? [`${underThousand(group, style)}${power ? ` ${power}` : ''}`] : [];
  });
  const last = groups.at(-1) ?? 0;
  if (style === 'and' && parts.length > 1 && last > 0 && last < 100) {
    return `${parts.slice(0, -1).join(' ')} and ${parts.at(-1)}`;
  }
  return parts.join(' ');
};
