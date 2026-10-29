/**
 * Meaning search, with no model at run time: the hymns about a query, and
 * the hymns like a hymn.
 *
 * The app ships a word table distilled from EmbeddingGemma (each word's
 * vector, the model run on the word alone, at 4 bits a value) and each
 * hymn's vector (the model run on its title and words, at 8 bits a value):
 * `assets/meaning/meaning.js`, built by `packages/hymnal/scripts/meaning`,
 * whose `table.ts` gives the format. A query's vector is the sum of its
 * words' rows, each weighted by how rare the word is in the hymnal; the
 * hymns about it are the hymns whose vectors lie nearest by cosine. A word
 * the table lacks adds nothing; a query of none finds no hymn.
 *
 * The table's strings are read on the first call (`table`), never at
 * start; a query decodes only its own words' rows.
 */

import { fold } from '@manna/hymnal/fold';
import { Duration, Effect, Fiber, Option } from 'effect';

import { meaning } from '../../assets/meaning/meaning.js';

interface Table {
  readonly dims: number;
  /** The words, sorted by code unit. */
  readonly words: ReadonlyArray<string>;
  /** Per word: its weight in a query times its row's scale. */
  readonly weights: Float32Array;
  /** The rows, in base64, `dims * 2 / 3` characters a word. */
  readonly rows: string;
  readonly numbers: ReadonlyArray<number>;
  /** Per hymn, its vector's values, `dims` a hymn, and one over their length. */
  readonly vectors: Int8Array;
  readonly lengths: Float32Array;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const SEXTET = new Uint8Array(128);
for (let i = 0; i < ALPHABET.length; i++) SEXTET[ALPHABET.charCodeAt(i)] = i;

/** The bytes of base64 `text` from character `from` to `to` (each a multiple of 4), into `out` from 0. */
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

/** The bytes of all of base64 `text`. */
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

/**
 * The table, read the first time it is asked for and kept. Search mode and
 * the hymn page read it soon after they open (`readMeaningSoon`), so
 * neither a keystroke's pause nor the About sheet pays for it.
 */
const table: () => Table = (() => {
  let read = Option.none<Table>();
  return () =>
    Option.getOrElse(read, () => {
      const made = tableOf();
      read = Option.some(made);
      return made;
    });
})();

/**
 * Reads the table in a task of its own after the one that asks, if it is not
 * read yet, so the next meaning search does not. The task that asks never
 * holds the thread for the read (about 55 ms in Hermes), and a frame can run
 * between them. Returns the cancel, for an effect's cleanup.
 */
export const readMeaningSoon = (): (() => void) => {
  const read = Effect.runFork(
    Effect.sleep(Duration.zero).pipe(Effect.andThen(Effect.sync(() => void table()))),
  );
  return () => void Effect.runFork(Fiber.interrupt(read));
};

/** Word `word`'s place in the sorted words, when the table knows it. */
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

/** The words a reader adds to say what they want, not what it is about. */
const ASKING = new Set(['hymn', 'hymns', 'song', 'songs', 'about']);

/**
 * A query's vector: its words' rows, weighted, summed; none when the table
 * knows none of its words but those it weighs at 0 (the commonest words of
 * the hymnal, which say nothing of what a query is about).
 */
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

/** The `count` hymn numbers whose vectors lie nearest `vector` by cosine, nearest first, but `skip`'s. */
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

/** The hymns about `query`, `count` at most, the nearest first; none when the table knows none of its words. */
export const about = (query: string, count = 10): ReadonlyArray<number> => {
  const t = table();
  return Option.match(queryOf(t, query), {
    onNone: () => [],
    onSome: (vector) => nearest(t, vector, count, 0),
  });
};

/** How long search mode waits after the last keystroke before it looks for the hymns about the query, in ms. */
export const PAUSE = 150;

/** How many hymns about a query search mode shows. */
export const ABOUT = 10;

/**
 * `query`, once it has stood `PAUSE` ms: search mode runs it on each
 * keystroke and interrupts the one before, so only a pause in the typing
 * asks for the hymns about the query.
 */
export const afterPause = (query: string): Effect.Effect<string> =>
  Effect.as(Effect.sleep(Duration.millis(PAUSE)), query);

/**
 * The hymns about `asked` that search mode shows under the results of
 * `shown`: none while the two differ, so an older query's hymns never stand
 * under a newer query's matches.
 */
export const aboutShown = <A>(
  asked: string,
  shown: string,
  hymns: ReadonlyArray<A>,
): ReadonlyArray<A> =>
  Option.getOrElse(
    Option.liftPredicate(hymns, () => asked === shown),
    () => [],
  );

/**
 * The hymns search mode shows about `query`: none for a query that holds a
 * digit (a number asked for, `no 100`) or has under three letters (a word
 * still being typed), else `about`'s `ABOUT`.
 */
export const aboutQuery = (query: string): ReadonlyArray<number> => {
  const folded = fold(query);
  if (/\d/.test(folded) || folded.replace(/ /g, '').length < 3) return [];
  return about(folded, ABOUT);
};

/** The hymns most like hymn `number`, `count` at most, the nearest first; none for a number the table lacks. */
export const moreLike = (number: number, count = 10): ReadonlyArray<number> => {
  const t = table();
  const h = t.numbers.indexOf(number);
  if (h < 0) return [];
  const vector = Float32Array.from(t.vectors.subarray(h * t.dims, (h + 1) * t.dims));
  return nearest(t, vector, count, number);
};
