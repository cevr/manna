import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Schema } from 'effect';
import { expect, it } from 'effect-bun-test';

/** The tagged words as `kjv-strongs.json` holds them: of each word, only the Strong's numbers it carries. */
const Tags = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({
      words: Schema.Array(
        Schema.Struct({ strongs: Schema.optionalKey(Schema.Array(Schema.String)) }),
      ),
    }),
  ),
);

/** The lexicon's entries, of each only the two fields a reader of a number needs. */
const Lexicon = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Struct({ lemma: Schema.String, def: Schema.String })),
);

const asset = (name: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    fs.readFileString(new URL(`../../assets/${name}`, import.meta.url).pathname),
  );

it.effect(
  "every Strong's number the tagged words carry has a lexicon entry with a lemma and a definition",
  () =>
    Effect.gen(function* () {
      const tags = yield* Schema.decodeEffect(Tags)(yield* asset('kjv-strongs.json'));
      const lexicon = yield* Schema.decodeEffect(Lexicon)(yield* asset('strongs.json'));
      const used = new Set(
        tags.flatMap((verse) =>
          verse.words.flatMap((word) => (word.strongs ?? []).map((number) => number.toUpperCase())),
        ),
      );
      const lacking = [...used].filter(
        (number) =>
          !Object.hasOwn(lexicon, number) ||
          lexicon[number]?.lemma.trim() === '' ||
          lexicon[number]?.def.trim() === '',
      );
      expect(used.size).toBeGreaterThan(14_000);
      expect([...used].filter((number) => number.startsWith('G')).length).toBeGreaterThan(5_000);
      expect(lacking).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
);
