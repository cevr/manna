import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Option, Schema } from 'effect';
import { expect, it } from 'effect-bun-test';

import { kjvChapterEnds } from './chapter-ends.js';

const Kjv = Schema.fromJsonString(
  Schema.Struct({
    verses: Schema.Array(
      Schema.Struct({ book: Schema.Finite, chapter: Schema.Finite, verse: Schema.Finite }),
    ),
  }),
);

it.effect("each chapter's end is the last verse kjv.json numbers in it", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(
      new URL('../../assets/kjv.json', import.meta.url).pathname,
    );
    const kjv = yield* Schema.decodeEffect(Kjv)(text);
    const last = new Map<string, number>();
    for (const { book, chapter, verse } of kjv.verses) {
      const key = `${String(book)}.${String(chapter)}`;
      last.set(key, Math.max(last.get(key) ?? 0, verse));
    }
    expect(last.size).toBe(1189);
    const wrong = [...last].filter(([key, verse]) => {
      const [book = 0, chapter = 0] = key.split('.').map(Number);
      return !Option.contains(kjvChapterEnds(book, chapter), verse);
    });
    expect(wrong).toEqual([]);
  }).pipe(Effect.provide(BunServices.layer)),
);
