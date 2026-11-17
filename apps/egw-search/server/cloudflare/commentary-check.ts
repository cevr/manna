/**
 * `bun run commentary:check [--url <origin>]`: the commentary pack egw.cvr.im
 * serves against the one this checkout builds from the local corpus
 * (`egw-paragraphs.db` under `BIBLE_CORPUS_DIR` or `~/.bible`, read-only).
 *
 * Run after a deploy: it reads the live pack with one GET and prints each
 * side's version and note count, John 1:14's count on each side, and how
 * many verses differ, by reference and count alone (never a note's text).
 * It exits non-zero when any verse's count differs or John 1:14 has fewer
 * than ten notes live. The corpus in D1 was loaded from the same file, so
 * the two agree when the deployed Worker builds the pack as this checkout
 * does.
 */
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { SqliteClient } from '@effect/sql-sqlite-bun';
import { Config, Console, Effect, Layer, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';
import { FetchHttpClient, HttpClient } from 'effect/http';

import { EGWParagraphDatabase, SqlAtomic } from '@manna/core/egw-db';

import { type CommentaryPack, CommentaryPackSchema } from '../api.js';
import { buildPack, PACK_PATH } from '../commentary-api.js';
import { DOMAIN } from './site.ts';

/** The check found the live pack unlike the local one. */
export class CommentaryCheckFailed extends Schema.TaggedError<CommentaryCheckFailed>()(
  'CommentaryCheckFailed',
  { message: Schema.String },
) {}

const JOHN_1_14 = '43.1:14';

/** The fewest notes John 1:14 has in a whole pack. */
const JOHN_1_14_FLOOR = 10;

/** Each verse's note count, keyed `<book>.<chapter>:<verse>` (verse 0 for a
 *  whole chapter). */
export const verseCounts = (pack: Pick<CommentaryPack, 'verses'>): ReadonlyMap<string, number> =>
  new Map(
    Object.entries(pack.verses).flatMap(([chapter, verses]) =>
      verses.map(([verse, indexes]) => [`${chapter}:${String(verse)}`, indexes.length] as const),
    ),
  );

/** The verses whose counts differ, each as `<key> <local>/<live>`. */
export const differingVerses = (
  local: ReadonlyMap<string, number>,
  live: ReadonlyMap<string, number>,
): readonly string[] =>
  [...new Set([...local.keys(), ...live.keys()])]
    .filter((key) => local.get(key) !== live.get(key))
    .sort()
    .map((key) => `${key} ${String(local.get(key) ?? 0)}/${String(live.get(key) ?? 0)}`);

const decodePack = Schema.decodeEffect(Schema.fromJsonString(CommentaryPackSchema));

/** The local corpus, read-only. */
const LocalCorpus = Layer.unwrap(
  Effect.gen(function* () {
    const home = yield* Config.String('HOME').pipe(Config.withDefault('.'));
    const root = yield* Config.String('BIBLE_CORPUS_DIR').pipe(
      Config.withDefault(`${home}/.bible`),
    );
    return EGWParagraphDatabase.layerExisting.pipe(
      Layer.provide(SqlAtomic.layerTransaction),
      Layer.provideMerge(
        SqliteClient.layer({ filename: `${root}/egw-paragraphs.db`, readonly: true }),
      ),
    );
  }),
);

const localPack = Effect.flatMap(buildPack, (built) => decodePack(built.body));

const livePack = (origin: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const answer = yield* client.get(`${origin}${PACK_PATH}`);
    return yield* decodePack(yield* answer.text);
  });

const check = (origin: string) =>
  Effect.gen(function* () {
    const local = yield* localPack;
    const live = yield* livePack(origin);
    const localCounts = verseCounts(local);
    const liveCounts = verseCounts(live);
    const differing = differingVerses(localCounts, liveCounts);
    const liveJohn = liveCounts.get(JOHN_1_14) ?? 0;
    yield* Console.log(`commentary local ${local.version} notes=${String(local.count)}`);
    yield* Console.log(`commentary live ${live.version} notes=${String(live.count)} at ${origin}`);
    yield* Console.log(
      `commentary John 1:14 local=${String(localCounts.get(JOHN_1_14) ?? 0)} live=${String(liveJohn)}`,
    );
    yield* Console.log(`commentary verses differing=${String(differing.length)}`);
    for (const line of differing.slice(0, 20)) yield* Console.log(`commentary differs ${line}`);
    if (differing.length > 0 || liveJohn < JOHN_1_14_FLOOR)
      return yield* CommentaryCheckFailed.make({ message: 'the live pack is not the local one' });
    yield* Console.log('commentary live pack matches');
  });

const commentaryCheck = Command.make('commentary-check', {
  url: Flag.String('url').pipe(
    Flag.withDefault(`https://${DOMAIN}`),
    Flag.withDescription('The origin whose pack is read'),
  ),
}).pipe(
  Command.withDescription(
    'Compare the served commentary pack with the one the local corpus builds',
  ),
  Command.withHandler(({ url }) =>
    check(url).pipe(Effect.provide(Layer.mergeAll(FetchHttpClient.layer, LocalCorpus))),
  ),
);

if (import.meta.main)
  Command.run(commentaryCheck, { version: '1.0.0' }).pipe(
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
