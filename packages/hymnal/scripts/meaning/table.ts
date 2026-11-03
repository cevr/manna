import { fold } from '../../src/fold.js';

export const wordsOf = (text: string): ReadonlyArray<string> =>
  fold(text).split(' ').filter(Boolean);

export const vocabularyOf = (
  list: ReadonlyArray<string>,
  hymnWords: Iterable<string>,
): ReadonlyArray<string> =>
  [...new Set([...list.filter((word) => /^[a-z]{2,}$/.test(word)), ...hymnWords])].toSorted(
    (a, b) => (a < b ? -1 : Number(a > b)),
  );

export const SIF = 1e-3;

export const FLOOR = 0.1;

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

export const CLIP = 3;

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

export const NOTICE =
  'The meaning table, made by `packages/hymnal/scripts/meaning/build.ts` (its format: `table.ts` there). Do not edit. ' +
  'Modified from EmbeddingGemma (google/embeddinggemma-300m), a Gemma model by Google: the model ' +
  'was run on single words and on the hymns, and its outputs were weighted and cut to 4 and 8 bits. ' +
  'Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms ' +
  '(a copy: `gemma-terms.js` beside this file). This file is under those Terms, not the ' +
  "repository's licence, and its use is subject to their section 3.2 use restrictions (`LICENSE`).";

export const NOTICE_LINES: ReadonlyArray<string> = [
  'export const notice =',
  `  ${JSON.stringify(NOTICE)};`,
];

export const textOf = (file: MeaningFile): string => {
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
