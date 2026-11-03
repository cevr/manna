import { paragraphIdentity } from '@manna/core/egw-db';
import { VectorBookRange } from '@manna/core/search';
import { Array as Arr, Option } from 'effect';

export interface VectorSourceRow {
  readonly bookCode: string;
  readonly paraId: string;
  readonly refcode: string;
  readonly text: string;
}

export const bookRanges = (rows: readonly VectorSourceRow[]): readonly VectorBookRange[] => {
  const ranges: VectorBookRange[] = [];
  let start = 0;
  for (let row = 1; row <= rows.length; row += 1) {
    const current = Option.map(Arr.get(rows, row - 1), (source) => source.bookCode);
    const next = Option.map(Arr.get(rows, row), (source) => source.bookCode);
    if (Option.isSome(current) && !Option.contains(next, current.value)) {
      ranges.push(
        VectorBookRange.make({ bookCode: current.value, offset: start, count: row - start }),
      );
      start = row;
    }
  }
  return ranges;
};

export const paragraphIds = (rows: readonly VectorSourceRow[]): readonly string[] =>
  rows.map((row) => paragraphIdentity(row.bookCode, Option.some(row.paraId), row.refcode));
