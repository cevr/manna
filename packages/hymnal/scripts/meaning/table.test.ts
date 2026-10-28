/**
 * The meaning table's file rules, each on small vectors made here: the
 * words it keeps, their weights, the 4- and 8-bit rows and how they are
 * laid out, and the module's text. No model runs.
 */

import { describe, expect, it } from 'bun:test';

import { DIMS } from './pins';
import {
  FLOOR,
  int4Row,
  int8Row,
  meaningFileOf,
  NOTICE_LINES,
  textOf,
  vocabularyOf,
  weightsOf,
} from './table';

const bytesOf = (base64: string) => new Uint8Array(Buffer.from(base64, 'base64'));

describe('the words', () => {
  it('keeps the list’s whole words of two letters or more and the hymns’ words, once, by code unit', () => {
    const list = ['[CLS]', '##ing', 'a', 'zeal', 'abide', '1990', 'grace', 'zeal'];
    expect(vocabularyOf(list, ['grace', 'thee', 'abide', 'o'])).toEqual([
      'abide',
      'grace',
      'o',
      'thee',
      'zeal',
    ]);
  });

  it('weighs a rare word more than a common one, and a word the hymns lack at 1', () => {
    const weights = weightsOf(
      ['rare', 'common', 'absent'],
      new Map([
        ['rare', 1],
        ['common', 1_000],
        ['filler', 2_000_000],
      ]),
    );
    expect(weights[0]).toBeGreaterThan(weights[1] ?? 1);
    expect(weights[1]).toBeGreaterThan(FLOOR);
    expect(weights[2]).toBe(1);
  });

  it('weighs a word at 0 when it is so common its weight falls under the floor', () => {
    // 1 word in 50 of the hymnal: SIF / (SIF + 0.02) is about 0.048, under 0.1.
    const [common, rare] = weightsOf(
      ['common', 'rare'],
      new Map([
        ['common', 2],
        ['rare', 0],
        ['other', 98],
      ]),
    );
    expect(FLOOR).toBe(0.1);
    expect({ common, rarePositive: (rare ?? 0) > 0 }).toEqual({ common: 0, rarePositive: true });
  });
});

describe('the rows', () => {
  it('cuts a word row to 4 bits, two values a byte, the first in the high half', () => {
    const { bytes, scale } = int4Row(Float32Array.from([0.7, -0.7, 0.1, 0, -0.3, 0.3]));
    // Six values of root mean square 0.43: the clip (3 × 0.43) lies past the largest, so the scale is 0.7 / 7.
    expect(scale).toBeCloseTo(0.1, 6);
    expect([...bytes]).toEqual([(15 << 4) | 1, (9 << 4) | 8, (5 << 4) | 11]);
  });

  it('clips a word row’s outlier at three times its root mean square', () => {
    const row = new Float32Array(16).fill(0.1);
    row[0] = 10;
    const { bytes, scale } = int4Row(row);
    expect(scale).toBeLessThan(10 / 7);
    expect(bytes[0]! >> 4).toBe(15);
  });

  it('cuts a hymn row to 8 bits that its scale multiplies back to within half a step', () => {
    const row = Float32Array.from([0.5, -0.25, 0.125, -0.0625]);
    const { bytes, scale } = int8Row(row);
    row.forEach((x, i) =>
      expect(Math.abs((bytes[i] ?? 0) * scale - x)).toBeLessThanOrEqual(scale / 2),
    );
  });
});

describe('the file', () => {
  const dims = 6;
  const file = meaningFileOf({
    source: 'test',
    dims,
    vocabulary: ['grace', 'peace'],
    counts: new Map([['grace', 3]]),
    wordRows: Float32Array.from([0.7, -0.7, 0.1, 0, -0.3, 0.3, 0, 0, 0, 0, 0, 0.5]),
    numbers: [7, 9],
    hymnRows: Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1]),
  });

  it('lays each word row out in its own run of base64, and folds its scale into its weight', () => {
    expect(file.words).toBe('grace peace');
    const table = bytesOf(file.table);
    expect(table.length).toBe(2 * (dims / 2));
    expect([...table.subarray(0, 3)]).toEqual([(15 << 4) | 1, (9 << 4) | 8, (5 << 4) | 11]);
    expect((file.table.length / 2) % 4).toBe(0);
    const weights = new Float32Array(bytesOf(file.weights).buffer);
    const [grace, peace] = weightsOf(['grace', 'peace'], new Map([['grace', 3]]));
    expect(weights[0]).toBeCloseTo((grace ?? 0) * 0.1, 6);
    expect(weights[1]).toBeCloseTo((peace ?? 0) * (0.5 / 7), 6);
  });

  it('keeps each hymn’s number, 8-bit row and one over its length in the same order', () => {
    expect(file.hymns).toBe('7 9');
    expect([...new Int8Array(bytesOf(file.vectors).buffer)]).toEqual([
      127, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -127,
    ]);
    const lengths = [...new Float32Array(bytesOf(file.lengths).buffer)];
    expect(lengths).toHaveLength(2);
    for (const length of lengths) expect(length).toBeCloseTo(1 / 127, 8);
  });

  it('writes a module that makes the file when called, a long string on the line after its key', () => {
    const text = textOf({ ...file, table: 'A'.repeat(200) });
    expect(text).toContain('export const meaning = () => ({\n');
    expect(text).toContain(`  table:\n    '${'A'.repeat(200)}',\n`);
    expect(text).toContain(`  dims: 6,\n`);
    expect(text).toContain(`  lengths: '${file.lengths}',\n`);
    expect(() => textOf({ ...file, source: "the hymnal's" })).toThrow();
  });

  it('opens the module with the notice that it is modified from EmbeddingGemma, under the Gemma Terms', () => {
    const text = textOf(file);
    const head = text.slice(0, text.indexOf('export const meaning'));
    expect(head).toBe(`${NOTICE_LINES.join('\n')}\n`);
    const said = head.replace(/\s*\n\s*\*\s*/g, ' ');
    for (const words of [
      'Modified from EmbeddingGemma',
      'Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms',
      'gemma-terms.js',
      'not the repository',
      'section 3.2 use restrictions',
    ])
      expect(said).toContain(words);
  });

  it('pins the model’s full width, which keeps a word row a whole run of base64', () => {
    expect((DIMS / 2) % 3).toBe(0);
  });
});
