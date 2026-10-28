/**
 * The meaning table's file, made from the model's vectors with no model in
 * the loop: pure functions, so a test holds each rule and two builds from
 * the same vectors write the same bytes.
 *
 * The app reads it (`apps/hymnal/src/hymns/meaning.ts`):
 * - `words`: every word the table knows, folded as search folds them, sorted
 *   by code unit and joined by spaces;
 * - `table`: per word, its vector (the model run on the word alone) at 4
 *   bits a value, two values a byte, the high half first, each value plus 8
 *   (1–15), `dims / 2` bytes a word, in base64 (a word's row is
 *   `dims * 2 / 3` characters, so each row decodes alone);
 * - `weights`: per word, a 32-bit float, little-endian, in base64: its
 *   weight in a query (SIF: rare words count more) times its row's scale;
 *   0 for a word so common in the hymnal that it says nothing (`FLOOR`);
 * - `hymns`: the hymn numbers, joined by spaces, in the vectors' order;
 * - `vectors`: per hymn, its vector (the model run on its title and words)
 *   at 8 bits a value, `dims` bytes a hymn, in base64;
 * - `lengths`: per hymn, one over the length of its 8-bit vector, a 32-bit
 *   float, little-endian, in base64, so the app reads a cosine with no pass
 *   over the vectors of its own.
 *
 * A query's vector is the weighted sum of its words' rows; the hymns about
 * it are the hymns whose vectors lie nearest by cosine, which no hymn's
 * scale changes, so the file keeps none.
 *
 * The file is a Model Derivative of EmbeddingGemma under the Gemma Terms
 * of Use, so its text opens with the notice that it is modified from the
 * model (`NOTICE_LINES`); `apps/hymnal/assets/meaning/LICENSE` says the rest.
 */

/** The fold search uses (`apps/hymnal/src/hymns/search.ts`): lower case, no accents, apostrophes joined, other punctuation a space. */
export const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export const wordsOf = (text: string): ReadonlyArray<string> =>
  fold(text).split(' ').filter(Boolean);

/** The words of the table: the word list's whole words of 2 letters or more, and every word the hymns hold, once, sorted by code unit. */
export const vocabularyOf = (
  list: ReadonlyArray<string>,
  hymnWords: Iterable<string>,
): ReadonlyArray<string> =>
  [...new Set([...list.filter((word) => /^[a-z]{2,}$/.test(word)), ...hymnWords])].toSorted(
    (a, b) => (a < b ? -1 : Number(a > b)),
  );

/** SIF's smoothing: a word as common as one in a thousand of the hymnal's counts half. */
export const SIF = 1e-3;

/**
 * The weight under which a word counts nothing in a query: the hymnal's
 * fifteen commonest words (`the`, `and`, `of` and the like), each more than
 * about one in a hundred of its words. A query of them alone finds no hymn.
 */
export const FLOOR = 0.1;

/**
 * Each word's weight in a query: `SIF / (SIF + its share of the hymnal's
 * words)`, or 0 under `FLOOR`; a word the hymns lack weighs 1.
 */
export const weightsOf = (
  vocabulary: ReadonlyArray<string>,
  counts: ReadonlyMap<string, number>,
): Float32Array => {
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  return Float32Array.from(vocabulary, (word) => {
    const weight = SIF / (SIF + (counts.get(word) ?? 0) / total);
    return weight < FLOOR ? 0 : weight;
  });
};

/** Where a word row's 4-bit values are clipped: three times the row's root mean square. */
export const CLIP = 3;

/** A word's row at 4 bits a value (-7 to 7, stored plus 8, two a byte, high half first), and the scale that multiplies them back. */
export const int4Row = (row: Float32Array) => {
  let most = 0;
  let squares = 0;
  for (const x of row) {
    most = Math.max(most, Math.abs(x));
    squares += x * x;
  }
  const scale = Math.min(most, CLIP * Math.sqrt(squares / row.length)) / 7 || 1;
  const bytes = new Uint8Array(row.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const high = Math.max(-7, Math.min(7, Math.round((row[2 * i] ?? 0) / scale))) + 8;
    const low = Math.max(-7, Math.min(7, Math.round((row[2 * i + 1] ?? 0) / scale))) + 8;
    bytes[i] = (high << 4) | low;
  }
  return { bytes, scale };
};

/** A hymn's row at 8 bits a value (-127 to 127), and the scale that multiplies them back. */
export const int8Row = (row: Float32Array) => {
  let most = 0;
  for (const x of row) most = Math.max(most, Math.abs(x));
  const scale = most / 127 || 1;
  return { bytes: Int8Array.from(row, (x) => Math.round(x / scale)), scale };
};

export interface MeaningFile {
  readonly source: string;
  readonly dims: number;
  readonly words: string;
  readonly weights: string;
  readonly table: string;
  readonly hymns: string;
  readonly vectors: string;
  readonly lengths: string;
}

const base64 = (bytes: ArrayBufferView) =>
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');

/**
 * The file from the model's vectors: `wordRows` (one row of `dims` per word
 * of `vocabulary`) and `hymnRows` (one per hymn of `numbers`), each row the
 * model's output, unit length.
 */
export const meaningFileOf = ({
  source,
  dims,
  vocabulary,
  counts,
  wordRows,
  numbers,
  hymnRows,
}: {
  readonly source: string;
  readonly dims: number;
  readonly vocabulary: ReadonlyArray<string>;
  readonly counts: ReadonlyMap<string, number>;
  readonly wordRows: Float32Array;
  readonly numbers: ReadonlyArray<number>;
  readonly hymnRows: Float32Array;
}): MeaningFile => {
  const weights = weightsOf(vocabulary, counts);
  const table = new Uint8Array((vocabulary.length * dims) / 2);
  vocabulary.forEach((_, w) => {
    const { bytes, scale } = int4Row(wordRows.subarray(w * dims, (w + 1) * dims));
    table.set(bytes, (w * dims) / 2);
    weights[w] = (weights[w] ?? 0) * scale;
  });
  const vectors = new Int8Array(numbers.length * dims);
  const lengths = new Float32Array(numbers.length);
  numbers.forEach((_, h) => {
    const { bytes } = int8Row(hymnRows.subarray(h * dims, (h + 1) * dims));
    vectors.set(bytes, h * dims);
    lengths[h] = 1 / (Math.hypot(...bytes) || 1);
  });
  return {
    source,
    dims,
    words: vocabulary.join(' '),
    weights: base64(weights),
    table: base64(table),
    hymns: numbers.join(' '),
    vectors: base64(vectors),
    lengths: base64(lengths),
  };
};

/**
 * The notice that opens the file: it is modified from EmbeddingGemma, and
 * under the Gemma Terms of Use with their use restrictions (section 3.1
 * asks a modified file to say so).
 */
export const NOTICE_LINES: ReadonlyArray<string> = [
  '/**',
  ' * The meaning table, made by `packages/hymnal/scripts/meaning/build.ts` (its format: `table.ts` there). Do not edit.',
  ' *',
  ' * Modified from EmbeddingGemma (google/embeddinggemma-300m), a Gemma model by Google: the model',
  ' * was run on single words and on the hymns, and its outputs were weighted and cut to 4 and 8 bits.',
  ' * Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms',
  ' * (a copy: `gemma-terms.js` beside this file). This file is under those Terms, not the',
  " * repository's licence, and its use is subject to their section 3.2 use restrictions (`LICENSE`).",
  ' */',
];

/**
 * The file's text: a module whose one export makes the table when called,
 * so the app reads its strings on the first meaning search, never at start;
 * written as the formatter leaves it. Its strings hold no quote and no
 * backslash, so each is written as it is.
 */
export const textOf = (file: MeaningFile): string => {
  /** A field as the formatter writes it: on its key's line when it fits in 100 columns, else on the next. */
  const field = (key: string, value: string) => {
    const line = `  ${key}: ${value},`;
    return line.length <= 100 ? line : `  ${key}:\n    ${value},`;
  };
  const quoted = (key: string, value: string) => {
    if (/['\\\n]/.test(value))
      throw new Error(`meaning: the ${key} string holds a quote, a backslash or a line break`);
    return field(key, `'${value}'`);
  };
  return [
    ...NOTICE_LINES,
    'export const meaning = () => ({',
    quoted('source', file.source),
    field('dims', String(file.dims)),
    quoted('words', file.words),
    quoted('weights', file.weights),
    quoted('table', file.table),
    quoted('hymns', file.hymns),
    quoted('vectors', file.vectors),
    quoted('lengths', file.lengths),
    '});',
    '',
  ].join('\n');
};
