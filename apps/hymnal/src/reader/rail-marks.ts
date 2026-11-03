import type { Row } from './rows';

export const GUTTER = 44;

export const railShift = (rest: number, scroll: number): number => {
  'worklet';
  return Math.max(0, rest - scroll);
};

export const labelAt = (index: number, count: number): number => {
  if (count <= 0) return 0;
  return ((index + 0.5) / count) * 100;
};

export const LABEL_SIZE = 10;

export const LABEL_LINE = 12;

export const LABEL_SCALE = 2;

export const labelHeight = (fontScale: number): number =>
  Math.ceil(LABEL_LINE * Math.min(fontScale, LABEL_SCALE));

export interface Mark {
  readonly number: number;
  readonly section: number;
  readonly offset: number;
}

export const marksOf = <Hymn extends { readonly number: number }>(
  rows: ReadonlyArray<Row<Hymn>>,
  top: number,
  heightOf: (kind: Row<Hymn>['kind']) => number,
): ReadonlyArray<Mark> => {
  const marks: Array<Mark> = [];
  const pin = heightOf('topic');
  let at = top;
  let section = -1;
  for (const row of rows) {
    if (row.kind === 'topic') section += 1;
    if (row.kind === 'hymn' && section >= 0)
      marks.push({ number: row.hymn.number, section, offset: at - pin });
    at += heightOf(row.kind);
  }
  return marks;
};

export const markAt = (y: number, length: number, count: number): number => {
  'worklet';
  if (count <= 0 || length <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor((y / length) * count)));
};

export const crossings = (before: number, now: number): number => {
  'worklet';
  return Math.abs(now - before);
};

export const labelsOf = (count: number, shown: number): ReadonlyArray<number> => {
  if (count <= 0 || shown <= 0) return [];
  if (count <= shown || shown === 1)
    return Array.from({ length: Math.min(count, shown) }, (_, i) => i);
  return Array.from({ length: shown }, (_, i) => Math.round((i * (count - 1)) / (shown - 1)));
};
