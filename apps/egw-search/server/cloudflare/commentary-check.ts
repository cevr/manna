/**
 * `bun run commentary:check [--url <origin>]`: the commentary pack egw.cvr.im
 * serves against the one this checkout builds from the local corpus
 * (`egw-paragraphs.db` under `BIBLE_CORPUS_DIR` or `~/.bible`, read-only).
 *
 * Run after a deploy: it reads the live pack with one GET and judges the
 * code that built it, not the corpus's age. D1 follows the weekly sync and
 * the local file does not, so the two packs' verse counts drift apart; the
 * check prints that drift and does not fail on it. It fails when the notes
 * both corpora hold (the same paragraph reference) link other verses live
 * in more than `RELINKED_SHARE` of them, when either side holds more than
 * `UNSHARED_SHARE` of its notes alone, or when John 1:14 has fewer than ten
 * notes live. It prints references and counts alone, never a note's text.
 */
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { SqliteClient } from '@effect/sql-sqlite-bun';
import { Config, Console, Effect, Layer, Option, Schema } from 'effect';
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

/** The largest share of the notes both packs hold that may link other
 *  verses live: a paragraph D1 has since edited (7 of 3583 on 2026-11-17).
 *  Reading citations by their title alone relinks far more. */
const RELINKED_SHARE = 0.01;

/** The largest share of a pack's notes the other may lack: paragraphs the
 *  weekly sync added, removed or renamed (49 of 3632 live on 2026-11-17). */
const UNSHARED_SHARE = 0.05;

/** Each note's verses, keyed by its reference; the second and later notes
 *  under one reference are keyed `<reference>#<n>`, in pack order. */
export const noteVerses = (
  pack: Pick<CommentaryPack, 'notes' | 'verses'>,
): ReadonlyMap<string, ReadonlySet<string>> => {
  const seen = new Map<string, number>();
  const keys = pack.notes.map(([reference]) => {
    const nth = (seen.get(reference) ?? 0) + 1;
    seen.set(reference, nth);
    return Option.match(
      Option.liftPredicate(nth, (count) => count > 1),
      { onNone: () => reference, onSome: (count) => `${reference}#${String(count)}` },
    );
  });
  const linked = new Map(keys.map((key) => [key, new Set<string>()]));
  for (const [chapter, verses] of Object.entries(pack.verses))
    for (const [verse, indexes] of verses)
      for (const index of indexes)
        linked.get(keys[index] ?? '')?.add(`${chapter}:${String(verse)}`);
  return linked;
};

/** What the check found: the notes both packs hold, those of them that link
 *  other verses live (`<reference> <local>/<live>` verse counts), the notes
 *  one side holds alone, and each reason it fails, none when it passes. */
export interface Judgement {
  readonly shared: number;
  readonly relinked: readonly string[];
  readonly localOnly: number;
  readonly liveOnly: number;
  readonly failures: readonly string[];
}

const sameVerses = (left: ReadonlySet<string>, right: ReadonlySet<string>): boolean =>
  left.size === right.size && [...left].every((verse) => right.has(verse));

/** The live pack judged against the local one by the notes both hold. */
export const judge = (
  local: Pick<CommentaryPack, 'notes' | 'verses'>,
  live: Pick<CommentaryPack, 'notes' | 'verses'>,
): Judgement => {
  const localNotes = noteVerses(local);
  const liveNotes = noteVerses(live);
  const relinked: string[] = [];
  let shared = 0;
  for (const [reference, verses] of localNotes)
    for (const served of Option.toArray(Option.fromUndefinedOr(liveNotes.get(reference)))) {
      shared += 1;
      if (!sameVerses(verses, served))
        relinked.push(`${reference} ${String(verses.size)}/${String(served.size)}`);
    }
  const localOnly = localNotes.size - shared;
  const liveOnly = liveNotes.size - shared;
  const john = verseCounts(live).get(JOHN_1_14) ?? 0;
  const failures = (
    [
      [
        relinked.length > shared * RELINKED_SHARE,
        `${String(relinked.length)} of ${String(shared)} shared notes link other verses live`,
      ],
      [
        localOnly > localNotes.size * UNSHARED_SHARE,
        `${String(localOnly)} of ${String(localNotes.size)} local notes are not live`,
      ],
      [
        liveOnly > liveNotes.size * UNSHARED_SHARE,
        `${String(liveOnly)} of ${String(liveNotes.size)} live notes are not local`,
      ],
      [
        john < JOHN_1_14_FLOOR,
        `John 1:14 has ${String(john)} notes live, under ${String(JOHN_1_14_FLOOR)}`,
      ],
    ] as const
  )
    .filter(([failed]) => failed)
    .map(([, message]) => message);
  return { shared, relinked: relinked.sort(), localOnly, liveOnly, failures };
};

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
    const judgement = judge(local, live);
    yield* Console.log(`commentary local ${local.version} notes=${String(local.count)}`);
    yield* Console.log(`commentary live ${live.version} notes=${String(live.count)} at ${origin}`);
    yield* Console.log(
      `commentary John 1:14 local=${String(localCounts.get(JOHN_1_14) ?? 0)} live=${String(liveCounts.get(JOHN_1_14) ?? 0)}`,
    );
    yield* Console.log(
      `commentary notes shared=${String(judgement.shared)} relinked=${String(judgement.relinked.length)} local-only=${String(judgement.localOnly)} live-only=${String(judgement.liveOnly)}`,
    );
    for (const line of judgement.relinked.slice(0, 20))
      yield* Console.log(`commentary relinked ${line}`);
    yield* Console.log(
      `commentary drift verses differing=${String(differing.length)} (the corpus's age, not judged)`,
    );
    for (const failure of judgement.failures) yield* Console.log(`commentary fails: ${failure}`);
    if (judgement.failures.length > 0)
      return yield* CommentaryCheckFailed.make({
        message: 'the live pack is not built as the local one',
      });
    yield* Console.log('commentary live pack is built as the local one');
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
