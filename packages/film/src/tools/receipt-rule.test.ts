import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, SchemaAST } from 'effect';
import * as BunServices from '@effect/platform-bun/BunServices';
import { AskRecord } from '../core/ask.ts';

/** The repo's root, from this file. */
const ROOT = `${import.meta.dir}/../../../..`;

/** Each place that states the rule, from the root. */
const PLACES = [
  'packages/film/src/tools/ask-store.ts',
  'packages/film/src/core/api.ts',
  'packages/film/README.md',
  'docs/lessons.md',
  'apps/firsttheblade/kit/approval.ts',
];

/** `text` read as prose: a comment's markers and every run of space dropped to one, in lower case. */
const prose = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(/^\s*(\/\/|\/\*\*|\*\/|\*)?\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const read = (place: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.readFileString(`${ROOT}/${place}`));

/** The rule as the description of an ask record's receipt gives it: its words after "by the receipt rule: ", up to where the description turns to the copies' folder. */
const RULE = Option.flatMap(
  Option.fromNullishOr(SchemaAST.resolveDescription(AskRecord.fields.shown.ast)),
  (d) =>
    Option.fromNullishOr(
      /by the receipt rule: (An image whose src .+?) Each copy is kept in the asks' folder/s.exec(
        d,
      )?.[1],
    ),
);

describe('the receipt rule', () => {
  it.effect("is the rule the description of an ask record's receipt gives", () =>
    Effect.sync(() =>
      expect(Option.map(RULE, (rule) => rule.split('. ').length)).toEqual(Option.some(3)),
    ),
  );

  it.effect('is stated word for word in each doc that states it', () =>
    Effect.gen(function* () {
      const rule = yield* Effect.fromOption(RULE);
      const missing = yield* Effect.filter(PLACES, (place) =>
        Effect.map(read(place), (text) => !prose(text).includes(prose(rule))),
      );
      expect(missing).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
