import { Array as Arr, Option } from 'effect';
import { wordError } from './align.ts';
import { normalizeWords } from './narration.ts';
import type { HeardAs } from './schema.ts';

const UNITS = new Map(
  [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
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
  ].map((word, n) => [word, n] as const),
);

const TENS = new Map(
  ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'].map(
    (word, n) => [word, (n + 2) * 10] as const,
  ),
);

const SCALES = new Map([
  ['thousand', 1e3],
  ['million', 1e6],
  ['billion', 1e9],
]);

const ABBREVIATIONS = new Map([
  ['mr', 'mister'],
  ['mrs', 'missus'],
  ['dr', 'doctor'],
  ['st', 'saint'],
  ['jr', 'junior'],
  ['sr', 'senior'],
  ['vs', 'versus'],
  ['etc', 'etcetera'],
]);

export const isAbbreviation = (word: string): boolean =>
  ABBREVIATIONS.has(word.replace(/[^\p{L}]/gu, '').toLowerCase());

const REFERENCE_WORDS = ['chapter', 'chapters', 'verse', 'verses'];

const RANGE_WORDS = ['to', 'through', 'thru'];

const isDigits = (token: string) => /^\d+$/.test(token);

const isNumberWord = (token: string) =>
  UNITS.has(token) || TENS.has(token) || token === 'hundred' || SCALES.has(token);

const isNumber = (token: string) => isDigits(token) || isNumberWord(token);

const digitsOf = (run: ReadonlyArray<string>): string => {
  const parts: Array<string> = [];
  let total = 0;
  let current = 0;
  let open = false;
  const close = () => {
    if (open) parts.push(String(total + current));
    total = 0;
    current = 0;
    open = false;
  };
  const add = (n: number, fits: boolean) => {
    if (open && !fits) close();
    current += n;
    open = true;
  };
  for (const token of run) {
    if (isDigits(token)) {
      close();
      current = Number(token);
      open = true;
      continue;
    }
    const unit = Option.fromNullishOr(UNITS.get(token));
    if (Option.isSome(unit)) {
      const afterTens = current % 10 === 0 && current % 100 >= 20 && unit.value < 10;
      add(unit.value, current % 100 === 0 || afterTens);
      continue;
    }
    const tens = Option.fromNullishOr(TENS.get(token));
    if (Option.isSome(tens)) {
      add(tens.value, current % 100 === 0);
      continue;
    }
    if (token === 'hundred') {
      current = Math.max(1, current) * 100;
      open = true;
      continue;
    }
    const scale = Option.fromNullishOr(SCALES.get(token));
    if (Option.isSome(scale)) {
      total += Math.max(1, current) * scale.value;
      current = 0;
      open = true;
    }
  }
  close();
  return parts.join('');
};

export const spokenWords = (text: string): ReadonlyArray<string> => {
  const tokens = normalizeWords(text.replace(/(\d)[,\u00a0\u202f](?=\d{3}(?!\d))/g, '$1')).map(
    (t) => Option.getOrElse(Option.fromNullishOr(ABBREVIATIONS.get(t)), () => t),
  );
  const at = (i: number) => Option.getOrElse(Arr.get(tokens, i), () => '');
  const kept = tokens.filter(
    (t, i) =>
      !(REFERENCE_WORDS.includes(t) && isNumber(at(i + 1))) &&
      !(RANGE_WORDS.includes(t) && isNumber(at(i - 1)) && isNumber(at(i + 1))),
  );
  const out: Array<string> = [];
  let run: Array<string> = [];
  for (const [i, t] of kept.entries()) {
    const next = Option.getOrElse(Arr.get(kept, i + 1), () => '');
    if (isNumber(t) || (t === 'and' && run.length > 0 && isNumber(next))) {
      run.push(t);
      continue;
    }
    if (run.length > 0) out.push(digitsOf(run));
    run = [];
    out.push(t);
  }
  if (run.length > 0) out.push(digitsOf(run));
  return out;
};

const asScript = (heard: ReadonlyArray<string>, heardAs: HeardAs): ReadonlyArray<string> => {
  const aliases = Object.entries(heardAs)
    .flatMap(([word, ways]) =>
      ways.map((way) => ({ way: spokenWords(way), word: spokenWords(word) })),
    )
    .filter((a) => a.way.length > 0)
    .toSorted((a, b) => b.way.length - a.way.length);
  const out: Array<string> = [];
  let i = 0;
  while (i < heard.length) {
    const found = Arr.findFirst(aliases, (a) =>
      a.way.every((w, k) => Arr.get(heard, i + k).pipe(Option.contains(w))),
    );
    if (Option.isSome(found)) {
      out.push(...found.value.word);
      i += found.value.way.length;
      continue;
    }
    out.push(Arr.getUnsafe(heard, i));
    i += 1;
  }
  return out;
};

export const lineError = (script: string, heard: string, heardAs: HeardAs): number =>
  wordError(spokenWords(script), asScript(spokenWords(heard), heardAs));
