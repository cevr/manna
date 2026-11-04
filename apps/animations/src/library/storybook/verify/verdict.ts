import { Option } from 'effect';
import { Bar, barText, type BarRow, type BarSource, type CheckId, meets } from './bars.ts';

/** One reading of a measure: where it was read, and its value, none where that place could not be read. */
export interface Sample {
  readonly at: string;
  readonly value: Option.Option<number>;
}

/** A measure's readings, each place it should be read; a check fails as unread when any is none, or when there are none. */
export type Samples = ReadonlyArray<Sample>;

/** Everything one run measured, by check: the verdict's only input. */
export type Measured = Readonly<Record<CheckId, Samples>>;

/** A reading that was read. */
export interface ReadSample {
  readonly at: string;
  readonly value: number;
}

/** A reading at `at`. */
export const one = (at: string, value: number): Sample => ({ at, value: Option.some(value) });

/** A place that could not be read. */
export const unreadAt = (at: string): Sample => ({ at, value: Option.none() });

/** The reading a bar judges: the largest for at-most, the smallest for at-least, the farthest from the target for near. */
export const worstFor = (
  bar: Bar,
  samples: ReadonlyArray<ReadSample>,
): Option.Option<ReadSample> => {
  const score = (value: number): number =>
    Bar.$match(bar, {
      AtMost: () => value,
      AtLeast: () => -value,
      Near: ({ target }) => Math.abs(value - target),
    });
  return Option.fromUndefinedOr(samples.toSorted((a, b) => score(b.value) - score(a.value))[0]);
};

/** One check's verdict. */
export interface CheckVerdict {
  readonly id: CheckId;
  readonly pass: boolean;
  readonly value: string;
  readonly at: string;
  readonly bar: string;
  readonly source: BarSource;
}

/** The whole verdict: how many checks pass of how many, and each check. */
export interface Verdict {
  readonly passed: number;
  readonly total: number;
  readonly checks: ReadonlyArray<CheckVerdict>;
}

const shown = (value: number): string => String(Number(value.toFixed(4)));

/** Each bar against its measure's worst reading; a measure with no reading, or any place it could not read, fails as unread. */
export const verdictOf = (bars: ReadonlyArray<BarRow>, measured: Measured): Verdict => {
  const checks = bars.map((row): CheckVerdict => {
    const base = { id: row.id, bar: barText(row.bar), source: row.source };
    const samples = measured[row.id];
    const unread = (at: string): CheckVerdict => ({ ...base, pass: false, value: 'unread', at });
    return Option.match(Option.fromUndefinedOr(samples.find((s) => Option.isNone(s.value))), {
      onSome: (s) => unread(s.at),
      onNone: () =>
        Option.match(
          worstFor(
            row.bar,
            samples.flatMap((s) =>
              Option.toArray(Option.map(s.value, (value) => ({ at: s.at, value }))),
            ),
          ),
          {
            onNone: () => unread('no reading'),
            onSome: (s) => ({
              ...base,
              pass: meets(row.bar, s.value),
              value: shown(s.value),
              at: s.at,
            }),
          },
        ),
    });
  });
  return { passed: checks.filter((c) => c.pass).length, total: checks.length, checks };
};

const word = (pass: boolean): string => {
  if (pass) return 'PASS';
  return 'FAIL';
};

/**
 * verdict.md: `PASS n/n pass` or `FAIL k/n pass` (k the checks that pass),
 * then `PASS|FAIL <id> <value> <bar> (<where>; <source>)` per check, then
 * one info line per figure.
 */
export const verdictText = (v: Verdict, info: ReadonlyArray<string>): string =>
  [
    `${word(v.passed === v.total)} ${v.passed}/${v.total} pass`,
    '',
    ...v.checks.map((c) => `${word(c.pass)} ${c.id} ${c.value} ${c.bar} (${c.at}; ${c.source})`),
    '',
    ...info.map((line) => `INFO ${line}`),
    '',
  ].join('\n');
