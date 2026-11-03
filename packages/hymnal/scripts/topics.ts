import { HymnId } from '@manna/core/hymnal';
import { Effect, Schema } from 'effect';

import { SourceHymnal } from './source-text.js';
import { type Topic, Topics } from '../src/hymn.js';

const FIRST = 1;
const LAST = 695;

const Move = Schema.Struct({
  first: Schema.Int,
  last: Schema.Int,
  from: Schema.Int,
  to: Schema.Int,
});

export const Printed = Schema.Struct({
  hymn: Schema.Int,
  heading: Schema.String,
  from: Schema.String,
});
export type Printed = typeof Printed.Type;

export const Fixes = Schema.Struct({
  print: Schema.String,
  moves: Schema.Array(Move),
  names: Schema.Array(Schema.Struct({ id: Schema.Int, name: Schema.String })),
  printed: Schema.Array(Printed),
});
export type Fixes = typeof Fixes.Type;

export const decodeFixes = (text: string) =>
  Schema.decodeEffect(Schema.fromJsonString(Fixes))(text);

export interface Rows {
  readonly categories: ReadonlyArray<{ readonly id: number; readonly name: string }>;
  readonly hymns: ReadonlyArray<{ readonly number: number; readonly categoryId: number }>;
}

export class TopicsError extends Schema.TaggedError<TopicsError>()('TopicsError', {
  reason: Schema.Literals([
    'a hymn with no row',
    'a move over another section',
    'a section split in two',
    'a section with no name',
    'refused by Topics',
  ]),
  detail: Schema.String,
}) {}

const fail = (reason: TopicsError['reason'], detail: string) =>
  Effect.fail(TopicsError.make({ reason, detail }));

export const buildTopics = (rows: Rows, fixes: Fixes): Effect.Effect<Topics, TopicsError> =>
  Effect.gen(function* () {
    const section = new Map(rows.hymns.map((h) => [h.number, h.categoryId]));
    for (let n = FIRST; n <= LAST; n++) {
      if (!section.has(n)) return yield* fail('a hymn with no row', `${n}`);
    }
    for (const move of fixes.moves) {
      for (let n = move.first; n <= move.last; n++) {
        if (section.get(n) !== move.from)
          return yield* fail(
            'a move over another section',
            `${n} is in ${section.get(n)}, the move says ${move.from}`,
          );
        section.set(n, move.to);
      }
    }
    const names = new Map(rows.categories.map((c) => [c.id, c.name]));
    for (const { id, name } of fixes.names) names.set(id, name);
    const topics: Topic[] = [];
    for (let n = FIRST; n <= LAST; n++) {
      const id = section.get(n) ?? 0;
      const open = topics[topics.length - 1];
      if (open?.id === id) {
        topics[topics.length - 1] = { ...open, last: n };
        continue;
      }
      const earlier = topics.find((t) => t.id === id);
      if (earlier !== undefined)
        return yield* fail(
          'a section split in two',
          `${id} holds ${earlier.first}-${earlier.last} and again from ${n}`,
        );
      const name = names.get(id);
      if (name === undefined) return yield* fail('a section with no name', `${id}`);
      topics.push({ id, name, first: n, last: n });
    }
    return yield* Schema.decodeEffect(Topics)({
      version: 1,
      book: 'sdah-1985',
      topics,
    }).pipe(
      Effect.mapError((e) => TopicsError.make({ reason: 'refused by Topics', detail: e.message })),
    );
  });

export const readRows = Effect.gen(function* () {
  const hymnal = yield* SourceHymnal;
  const categories = yield* hymnal.getCategories;
  const hymns = yield* Effect.forEach(
    Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i),
    (n) =>
      hymnal
        .getHymn(HymnId.make(n))
        .pipe(Effect.map((h) => ({ number: n, categoryId: h.categoryId }))),
  );
  return { categories, hymns } satisfies Rows;
});
