import { describe, expect, it } from 'bun:test';
import {
  DIMENSIONS,
  encodeVectorIndex,
  MODEL_FINGERPRINT,
  parseVectorIndex,
  scanVectorIndex,
  VectorBookRange,
  VectorManifest,
} from '@manna/core/search';

import { bookRanges, paragraphIds, type VectorSourceRow } from './emit.js';

const row = (bookCode: string, refcode: string, text: string, paraId: string): VectorSourceRow => ({
  bookCode,
  refcode,
  text,
  paraId,
});

const ROWS: readonly VectorSourceRow[] = [
  row('GC', 'GC 425.1', 'the sanctuary in heaven', '14879.1'),
  row('GC', 'GC 425.2', 'it concerns every soul', '14879.2'),
  row('GC', 'GC 489.1', 'the investigative judgment', '14879.3'),
  row('GC', 'GC 490.1', 'probation closes', '14879.4'),
  row('DA', 'DA 311.5', 'the law written in the heart', '13020.1'),
  row('DA', 'DA 555.1', 'the close of probation', '13020.2'),
  row('EW', 'EW 279.1', 'the loud cry of the third angel', '12001.1'),
  row('EW', 'EW 280.1', 'the latter rain', '12001.2'),
  row('EW', 'EW 281.1', 'the sealing', '12001.3'),
];

const syntheticVectors = (rows: readonly VectorSourceRow[]): Int8Array => {
  const vectors = new Int8Array(rows.length * DIMENSIONS);
  rows.forEach((_row, index) => {
    for (let axis = 0; axis < DIMENSIONS; axis += 1) {
      vectors[index * DIMENSIONS + axis] = Math.round(
        127 * Math.sin((index + 1) * 0.7 + axis * 0.13),
      );
    }
  });
  return vectors;
};

const build = (rows: readonly VectorSourceRow[]): ArrayBuffer =>
  encodeVectorIndex({
    fingerprint: MODEL_FINGERPRINT,
    manifest: VectorManifest.make({
      books: bookRanges(rows),
      paragraphIds: paragraphIds(rows),
    }),
    vectors: syntheticVectors(rows),
  });

describe('§9.2 the per-book manifest', () => {
  it('describes contiguous runs that tile the rows', () => {
    const ranges = bookRanges(ROWS);
    expect(ranges.map((range) => range.bookCode)).toEqual(['GC', 'DA', 'EW']);
    expect(ranges.map((range) => range.offset)).toEqual([0, 4, 6]);
    expect(ranges.map((range) => range.count)).toEqual([4, 2, 3]);
    expect(ranges.reduce((total, range) => total + range.count, 0)).toBe(ROWS.length);
  });

  it('handles a single book and a single paragraph', () => {
    expect(bookRanges([]).length).toBe(0);
    const one = bookRanges([row('GC', 'GC 1.1', 'text', '1.1')]);
    expect(one).toEqual([VectorBookRange.make({ bookCode: 'GC', offset: 0, count: 1 })]);
  });

  it('keys paragraphs the way the search service does', () => {
    expect(paragraphIds(ROWS)[0]).toBe('GC:14879.1');
    expect(paragraphIds(ROWS)[4]).toBe('DA:13020.1');
  });
});

describe('§10 the writer round-trips through the shipped reader', () => {
  it('produces an index the parser accepts', () => {
    const parsed = parseVectorIndex(build(ROWS));
    expect(parsed._tag).toBe('ok');
    if (parsed._tag !== 'ok') return;
    expect(parsed.index.count).toBe(ROWS.length);
    expect(parsed.index.fingerprint).toBe(MODEL_FINGERPRINT);
    expect(parsed.index.dimensions).toBe(DIMENSIONS);
  });

  it('puts every paragraph’s vector at its own row', () => {
    const parsed = parseVectorIndex(build(ROWS));
    if (parsed._tag !== 'ok') return;
    const vectors = syntheticVectors(ROWS);
    ROWS.forEach((source, index) => {
      const query = vectors.slice(index * DIMENSIONS, (index + 1) * DIMENSIONS);
      const scan = scanVectorIndex(parsed.index, query, { topK: 1 });
      expect({ index, id: scan.neighbors[0]?.paragraphId }).toEqual({
        index,
        id: `${source.bookCode}:${source.paraId}`,
      });
    });
  });

  it('scopes a scan to one book through the manifest it wrote', () => {
    const parsed = parseVectorIndex(build(ROWS));
    if (parsed._tag !== 'ok') return;
    const vectors = syntheticVectors(ROWS);
    const scan = scanVectorIndex(parsed.index, vectors.slice(0, DIMENSIONS), {
      topK: 3,
      allow: new Set(['EW']),
    });
    expect(scan.neighbors.length).toBe(3);
    expect(scan.neighbors.every((neighbor) => neighbor.paragraphId.startsWith('EW:'))).toBe(true);
    expect(scan.scanned).toBe(ROWS.filter((source) => source.bookCode === 'EW').length);
  });

  it('is byte-identical across two builds of the same rows', () => {
    expect(new Uint8Array(build(ROWS))).toEqual(new Uint8Array(build(ROWS)));
  });
});
