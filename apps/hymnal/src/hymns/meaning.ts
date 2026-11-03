import { fold } from '@manna/hymnal/fold';
import { Duration, Effect, Fiber, Option } from 'effect';

import { meaning } from '../../assets/meaning/meaning.js';

interface Table {
  readonly dims: number;
  readonly words: ReadonlyArray<string>;
  readonly weights: Float32Array;
  readonly rows: string;
  readonly numbers: ReadonlyArray<number>;
  readonly vectors: Int8Array;
  readonly lengths: Float32Array;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const SEXTET = new Uint8Array(128);
for (let i = 0; i < ALPHABET.length; i++) SEXTET[ALPHABET.charCodeAt(i)] = i;

const decode = (text: string, from: number, to: number, out: Uint8Array): Uint8Array => {
  let at = 0;
  for (let i = from; i < to; i += 4) {
    const a = SEXTET[text.charCodeAt(i)] ?? 0;
    const b = SEXTET[text.charCodeAt(i + 1)] ?? 0;
    const c = SEXTET[text.charCodeAt(i + 2)] ?? 0;
    const d = SEXTET[text.charCodeAt(i + 3)] ?? 0;
    out[at++] = (a << 2) | (b >> 4);
    if (text.charCodeAt(i + 2) !== 61) out[at++] = ((b & 15) << 4) | (c >> 2);
    if (text.charCodeAt(i + 3) !== 61) out[at++] = ((c & 3) << 6) | d;
  }
  return out;
};

const decodeAll = (text: string): Uint8Array => {
  const padding = Number(text.endsWith('=')) + Number(text.endsWith('=='));
  return decode(text, 0, text.length, new Uint8Array((text.length / 4) * 3 - padding));
};

const tableOf = (): Table => {
  const file = meaning();
  return {
    dims: file.dims,
    words: file.words.split(' '),
    weights: new Float32Array(decodeAll(file.weights).buffer),
    rows: file.table,
    numbers: file.hymns.split(' ').map(Number),
    vectors: new Int8Array(decodeAll(file.vectors).buffer),
    lengths: new Float32Array(decodeAll(file.lengths).buffer),
  };
};

const table: () => Table = (() => {
  let read = Option.none<Table>();
  return () =>
    Option.getOrElse(read, () => {
      const made = tableOf();
      read = Option.some(made);
      return made;
    });
})();

const READ_AFTER = Duration.millis(1);

export const readMeaningSoon = (): (() => void) => {
  const read = Effect.runFork(
    Effect.sleep(READ_AFTER).pipe(Effect.andThen(Effect.sync(() => void table()))),
  );
  return () => void Effect.runFork(Fiber.interrupt(read));
};

const placeOf = (words: ReadonlyArray<string>, word: string): Option.Option<number> => {
  let low = 0;
  let high = words.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((words[middle] ?? '') < word) low = middle + 1;
    else high = middle;
  }
  return Option.liftPredicate(low, () => words[low] === word);
};

const ASKING = new Set(['hymn', 'hymns', 'song', 'songs', 'about']);

const queryOf = (t: Table, query: string): Option.Option<Float32Array> => {
  const vector = new Float32Array(t.dims);
  const bytes = new Uint8Array(t.dims / 2);
  const width = (t.dims * 2) / 3;
  const known = fold(query)
    .split(' ')
    .filter((word) => !ASKING.has(word))
    .flatMap((word) => Option.toArray(placeOf(t.words, word)))
    .filter((w) => (t.weights[w] ?? 0) > 0);
  for (const w of known) {
    decode(t.rows, w * width, (w + 1) * width, bytes);
    const weight = t.weights[w] ?? 0;
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i] ?? 0;
      vector[2 * i] = (vector[2 * i] ?? 0) + ((byte >> 4) - 8) * weight;
      vector[2 * i + 1] = (vector[2 * i + 1] ?? 0) + ((byte & 15) - 8) * weight;
    }
  }
  return Option.liftPredicate(vector, () => known.length > 0);
};

const nearest = (
  t: Table,
  vector: Float32Array,
  count: number,
  skip: number,
): ReadonlyArray<number> => {
  const scores = new Float32Array(t.numbers.length);
  for (let h = 0; h < t.numbers.length; h++) {
    let sum = 0;
    const from = h * t.dims;
    for (let c = 0; c < t.dims; c++) sum += (vector[c] ?? 0) * (t.vectors[from + c] ?? 0);
    scores[h] = sum * (t.lengths[h] ?? 0);
  }
  return t.numbers
    .map((_, h) => h)
    .filter((h) => t.numbers[h] !== skip)
    .toSorted((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0) || a - b)
    .slice(0, count)
    .map((h) => t.numbers[h] ?? 0);
};

export const about = (query: string, count = 10): ReadonlyArray<number> => {
  const t = table();
  return Option.match(queryOf(t, query), {
    onNone: () => [],
    onSome: (vector) => nearest(t, vector, count, 0),
  });
};

export const PAUSE = 150;

export const ABOUT = 10;

export const afterPause = (query: string): Effect.Effect<string> =>
  Effect.as(Effect.sleep(Duration.millis(PAUSE)), query);

export const aboutShown = <A>(
  asked: string,
  shown: string,
  hymns: ReadonlyArray<A>,
): ReadonlyArray<A> =>
  Option.getOrElse(
    Option.liftPredicate(hymns, () => asked === shown),
    () => [],
  );

export const aboutQuery = (query: string): ReadonlyArray<number> => {
  const folded = fold(query);
  if (/\d/.test(folded) || folded.replace(/ /g, '').length < 3) return [];
  return about(folded, ABOUT);
};

export const moreLike = (number: number, count = 10): ReadonlyArray<number> => {
  const t = table();
  const h = t.numbers.indexOf(number);
  if (h < 0) return [];
  const vector = Float32Array.from(t.vectors.subarray(h * t.dims, (h + 1) * t.dims));
  return nearest(t, vector, count, number);
};
