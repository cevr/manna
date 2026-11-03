import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, SchemaAST } from 'effect';
import * as BunServices from '@effect/platform-bun/BunServices';
import { AskRecord, RECEIPT_RULE } from '../core/ask.ts';

const ROOT = `${import.meta.dir}/../../../..`;

const DOCS_STATING_THE_RULE = ['packages/film/README.md', 'docs/lessons.md'];

const prose = (text: string) => text.replace(/\s+/g, ' ').toLowerCase();

const read = (place: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.readFileString(`${ROOT}/${place}`));

describe('the receipt rule', () => {
  it.effect("is the rule the description of an ask record's receipt gives", () =>
    Effect.sync(() => {
      const description = Option.fromNullishOr(
        SchemaAST.resolveDescription(AskRecord.fields.shown.ast),
      );
      const rule = Option.flatMap(description, (d) =>
        Option.map(Option.fromNullishOr(/by the receipt rule: (.*)$/s.exec(d)?.[1]), (after) =>
          after.slice(0, RECEIPT_RULE.length),
        ),
      );
      expect(rule).toEqual(Option.some(RECEIPT_RULE));
    }),
  );

  it.effect('is stated word for word in each doc that states it', () =>
    Effect.gen(function* () {
      const missing = yield* Effect.filter(DOCS_STATING_THE_RULE, (place) =>
        Effect.map(read(place), (text) => !prose(text).includes(prose(RECEIPT_RULE))),
      );
      expect(missing).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
