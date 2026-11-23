/* oxlint-disable effect/noTernary, effect/noNullish, effect/noGlobals -- a generated command line: a switch or a flag's value is there or not, and two word lists are compared as their JSON text. */
import { describe, expect, test } from 'bun:test';
import { Arbitrary, Effect, Schema } from 'effect';

import { parseArgs } from './args.ts';
import { IOS, WEB } from './model.ts';

const holds = <A>(arbitrary: Arbitrary.Arbitrary<A>, property: (value: A) => boolean) =>
  expect(
    Arbitrary.formatCheckFailure(
      Effect.runSync(Arbitrary.checkEffect(arbitrary, property, { runs: 300, seed: 7 })),
    ),
  ).toBeUndefined();

const oneOf = <A>(values: ReadonlyArray<A>) =>
  Arbitrary.map(
    Arbitrary.schema(
      Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: values.length - 1 })),
    ),
    (at) => values[at] as A,
  );

const word = oneOf([
  'home.page',
  'about.page',
  'find.none',
  'hymnal',
  'heartseed',
  'home.sections',
]);

/** A command line: its words, and each flag's value or none, laid out in a drawn order. */
const lines = Arbitrary.flatMap(
  Arbitrary.all([
    Arbitrary.array(word, { maxLength: 4 }),
    oneOf([false, true]),
    oneOf<string | undefined>([undefined, ...IOS.schemes]),
    oneOf<string | undefined>([undefined, 'pm-tokens', 'pm-hy-find']),
    oneOf([false, true]),
  ]),
  ([words, web, scheme, unit, repin]) =>
    Arbitrary.map(
      Arbitrary.all([
        oneOf<string | undefined>([
          undefined,
          ...(web ? WEB.viewports : [IOS.size, ...IOS.sweepSizes]),
        ]),
        Arbitrary.array(oneOf([0, 1, 2, 3, 4, 5, 6, 7]), { minLength: 8, maxLength: 8 }),
      ]),
      ([size, order]) => {
        const flags: Array<ReadonlyArray<string>> = [
          ...(scheme === undefined ? [] : [['--scheme', scheme]]),
          ...(size === undefined ? [] : [['--size', size]]),
          ...(unit === undefined ? [] : [['--unit', unit]]),
          ...(web ? [['--web']] : []),
          ...(repin ? [['--repin']] : []),
        ];
        const parts = [
          ...words.map((each) => ({ word: true, part: [each] })),
          ...flags.map((part) => ({ word: false, part })),
        ]
          .map((each, i) => ({ ...each, key: (order[i % order.length] ?? 0) * 100 + i }))
          .toSorted((a, b) => a.key - b.key);
        return {
          argv: ['shot', ...parts.flatMap(({ part }) => part)],
          words: parts.filter((each) => each.word).flatMap(({ part }) => part),
          web,
          scheme,
          size,
          unit,
          repin,
        };
      },
    ),
);

describe("pixel's command line", () => {
  test('every word is a word and every flag keeps its value, in any order; no value is read as a row', () =>
    holds(lines, (line) => {
      const asked = parseArgs(line.argv);
      return (
        asked._tag === 'Asked' &&
        asked.command === 'shot' &&
        JSON.stringify(asked.words) === JSON.stringify(line.words) &&
        asked.words.every((each) => ![line.scheme, line.size, line.unit].includes(each)) &&
        asked.web === line.web &&
        asked.repin === line.repin &&
        asked.scheme === line.scheme &&
        asked.size === line.size &&
        asked.unit === line.unit
      );
    }));

  test('a valued flag with no value, an unknown value or an unknown flag refuses with its reason', () => {
    const reasons = [
      ['shot', 'hymnal', 'about.page', '--size'],
      ['shot', 'hymnal', 'about.page', '--size', ''],
      ['shot', 'hymnal', 'about.page', '--size', '--scheme', 'light'],
      ['shot', 'hymnal', 'about.page', '--scheme', 'light large'],
      ['shot', 'hymnal', 'about.page', '--size', 'huge'],
      ['shot', 'hymnal', 'about.page', '--size', '390x844@2'],
      ['shot', 'hymnal', 'about.page', '--web', '--size', 'large'],
      ['report', '--unit'],
      ['shot', 'hymnal', '--sizes', 'large'],
    ].map((argv) => {
      const asked = parseArgs(argv);
      return asked._tag === 'Refused' ? asked.reason : 'asked';
    });
    expect(reasons).toEqual([
      '--size needs a value',
      '--size needs a value',
      '--size needs a value',
      '--scheme light large: light or dark',
      `--size huge: one of ${[IOS.size, ...IOS.sweepSizes].join(', ')} (a viewport with --web)`,
      `--size 390x844@2: one of ${[IOS.size, ...IOS.sweepSizes].join(', ')} (a viewport with --web)`,
      `--size large: one of ${WEB.viewports.join(', ')}`,
      '--unit needs a value',
      '--sizes: no such flag',
    ]);
  });
});
