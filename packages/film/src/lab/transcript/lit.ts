import { Array as Arr, Option, Order } from 'effect';
import type { CodeRange } from '../../core/schema.ts';

export interface Row {
  readonly index: number;
  readonly text: string;
  readonly struck: boolean;
  readonly from: number;
  readonly start: Option.Option<number>;
}

export interface SectionRows {
  readonly id: string;
  readonly take: string;
  readonly rows: ReadonlyArray<Row>;
  readonly marks: Readonly<Record<string, number>>;
}

export interface WordAt {
  readonly section: string;
  readonly index: number;
}

export const rowOf = (sections: ReadonlyArray<SectionRows>, at: WordAt): Option.Option<Row> =>
  Option.flatMap(
    Arr.findFirst(sections, (s) => s.id === at.section),
    (s) => Arr.findFirst(s.rows, (r) => r.index === at.index),
  );

export const rangesOf = (rows: ReadonlyArray<Row>): ReadonlyArray<CodeRange> =>
  Arr.sort(
    rows.map((r): CodeRange => [r.from, r.from + r.text.length]),
    Order.mapInput(Order.Number, ([from]: CodeRange) => from),
  ).reduce<ReadonlyArray<CodeRange>>(
    (runs, [from, to]) =>
      Option.match(
        Option.filter(Arr.last(runs), ([, end]) => from <= end + 1),
        {
          onNone: () => [...runs, [from, to]],
          onSome: ([start, end]) => [...Arr.dropRight(runs, 1), [start, Math.max(end, to)]],
        },
      ),
    [],
  );
