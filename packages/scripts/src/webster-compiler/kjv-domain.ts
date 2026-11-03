import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Effect, FileSystem, Schema } from 'effect';

const Kjv = Schema.Struct({ verses: Schema.Array(Schema.Struct({ text: Schema.String })) });
const Census = Schema.fromJsonString(
  Schema.Struct({
    sourceSha256: Schema.String,
    verses: Schema.Int,
    forms: Schema.Array(Schema.Struct({ form: Schema.String, frequency: Schema.Int })),
  }),
);

/** Reproduce the raw census; resolved lemmas are reviewed data, not a stemmer's output. */
Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const bytes = yield* fs.readFile(
    new URL('../../../core/assets/kjv.json', import.meta.url).pathname,
  );
  const source = yield* Schema.decodeEffect(Schema.fromJsonString(Kjv))(
    new TextDecoder().decode(bytes),
  );
  const counts = new Map<string, number>();
  const extras = new Set(['art', 'breast', 'dost', 'doth', 'hast', 'hath', 'saith', 'wast']);
  for (const verse of source.verses) {
    for (const form of verse.text.toLowerCase().match(/[a-z]+(?:['’-][a-z]+)*/gu) ?? []) {
      if (/(eth|est)$/u.test(form) || extras.has(form))
        counts.set(form, (counts.get(form) ?? 0) + 1);
    }
  }
  const forms = [...counts]
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([form, frequency]) => ({ form, frequency }));
  yield* Console.log(
    yield* Schema.encodeEffect(Census)({
      sourceSha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex'),
      verses: source.verses.length,
      forms,
    }),
  );
}).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
