import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Schema } from 'effect';
import { expect, it } from 'effect-bun-test';

/** The lexicon as `strongs-clean` (packages/scripts) leaves it: every field a text, of the five the lexicon names. */
const Lexicon = Schema.fromJsonString(
  Schema.Record(
    Schema.String,
    Schema.StructWithRest(Schema.Struct({ def: Schema.String }), [
      Schema.Record(Schema.String, Schema.String),
    ]),
  ),
);

const FIELDS = new Set(['lemma', 'xlit', 'def', 'pron', 'kjvDef']);

const flat = (text: string) => text.replace(/\s+/gu, ' ').trim();

/** Each defect the repair removed, by the rule `hs-strongs`' acceptance counts it with. */
const DEFECTS = {
  'starts with null': (def: string) => def.trimStart().startsWith('null'),
  'written twice': (def: string) => {
    const text = flat(def).replace(/^null/u, '');
    const probe = text.slice(10, 40);
    return probe.length === 30 && text.indexOf(probe, 11) > 0;
  },
  'holds no letter': (def: string) => !/\p{L}/u.test(def),
  'has a run of three spaces': (def: string) => /\S\s{3,}\S/u.test(def),
};

it.effect(
  'the Strong lexicon holds every number once, whole, with none of the defects it was repaired of',
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const text = yield* fs.readFileString(
        new URL('../../assets/strongs.json', import.meta.url).pathname,
      );
      const lexicon = yield* Schema.decodeEffect(Lexicon)(text);
      const numbers = Object.keys(lexicon);
      expect(numbers).toHaveLength(13_434);
      expect(numbers.filter((number) => !/^[GH][1-9]\d*$/u.test(number))).toEqual([]);
      expect(
        Object.entries(lexicon).flatMap(([number, entry]) =>
          Object.keys(entry)
            .filter((field) => !FIELDS.has(field))
            .map((field) => `${number}.${field}`),
        ),
      ).toEqual([]);
      for (const [defect, has] of Object.entries(DEFECTS))
        expect(
          Object.entries(lexicon)
            .filter(([, entry]) => has(entry.def))
            .map(([number]) => number),
          defect,
        ).toEqual([]);
      expect(
        Object.entries(lexicon)
          .filter(([number, entry]) => number === 'G25' && /\blove\b/iu.test(entry.def))
          .map(([number]) => number),
      ).toEqual(['G25']);
    }).pipe(Effect.provide(BunServices.layer)),
);
