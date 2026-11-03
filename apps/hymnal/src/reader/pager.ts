import { Option } from 'effect';

export interface Pages {
  readonly list: ReadonlyArray<number>;
  readonly index: number;
}

export const pageSource = (
  source: Option.Option<ReadonlyArray<number>>,
  number: number,
  all: ReadonlyArray<number>,
): Pages =>
  source.pipe(
    Option.filter((list) => list.includes(number)),
    Option.getOrElse(() => all),
    (list) => ({ list, index: Math.max(0, list.indexOf(number)) }),
  );

export const settledAt = (
  offset: number,
  width: number,
  list: ReadonlyArray<number>,
): Option.Option<number> =>
  Option.fromUndefinedOr(
    list[Math.min(Math.max(Math.round(offset / Math.max(width, 1)), 0), list.length - 1)],
  );

export const onPage = (offset: number, width: number): boolean =>
  Math.abs(offset - Math.round(offset / Math.max(width, 1)) * width) <= 0.5;

export const backEdge = 20;
