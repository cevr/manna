/**
 * `GET /api/commentary/pack`: Ellen White's Bible Commentary as one pack.
 *
 * The pack is built from the corpus the server already holds, through the
 * paragraph database's own reads: per volume, its books and its paragraphs,
 * whose citations and verse headings make the links. Each host keeps the built pack its own way (`CommentaryPacks`):
 * the Bun server in memory, the Worker in the edge cache.
 */

import {
  Array as Arr,
  Context,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Order,
  Stream,
} from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';

import { nodesToText, volumeVerses } from '@manna/core/egw';
import { EGWParagraphDatabase } from '@manna/core/egw-db';

import { CommentaryFailed, SearchApi } from './api.js';
import { builtPack, type BuiltPack, COMMENTARY_BOOKS, type CommentaryLink } from './commentary.js';

/** How long a built pack is kept and may be cached downstream. */
export const PACK_TTL = Duration.hours(1);

/** The pack's path, the address it is kept under at the edge. */
export const PACK_PATH = '/api/commentary/pack';

const CACHE_CONTROL = `public, max-age=${String(Duration.toSeconds(PACK_TTL))}`;

/** The links of one volume, read from its paragraphs in publication order
 *  (`volumeVerses`), not from the stored link rows: those were written by
 *  whichever extractor ran at import, and a deploy must carry today's
 *  reading. A paragraph with no short reference is never a note. */
const volumeLinks = (db: EGWParagraphDatabase['Service'], bookId: number, bookCode: string) =>
  Effect.gen(function* () {
    const paragraphs = Arr.sort(
      yield* Stream.runCollect(db.getParagraphsByBook(bookId)),
      Order.mapInput(
        Order.Number,
        (paragraph: { readonly puborder: number }) => paragraph.puborder,
      ),
    );
    const verses = volumeVerses(paragraphs);
    return paragraphs.flatMap((paragraph, at): CommentaryLink[] =>
      Option.toArray(paragraph.refcode_short).flatMap((reference) => {
        const cited = verses[at] ?? [];
        if (cited.length === 0) return [];
        const text = nodesToText(paragraph.nodes);
        return cited.map((verse) => ({
          bookCode,
          puborder: paragraph.puborder,
          reference,
          text,
          ...verse,
        }));
      }),
    );
  });

/** Every commentary link in the corpus, read volume by volume. */
export const commentaryLinks = Effect.gen(function* () {
  const db = yield* EGWParagraphDatabase;
  const links: CommentaryLink[] = [];
  for (const code of COMMENTARY_BOOKS) {
    const books = yield* db.getBooksByCode(code);
    for (const book of books) links.push(...(yield* volumeLinks(db, book.book_id, book.book_code)));
  }
  return links;
});

/** The pack built from the corpus. A failed read fails the build whole, as
 *  search's does, so a partial pack is never served. */
export const buildPack: Effect.Effect<BuiltPack, CommentaryFailed, EGWParagraphDatabase> =
  commentaryLinks.pipe(
    Effect.map(builtPack),
    Effect.catchCause((cause) =>
      Effect.logError('commentary.pack.failed').pipe(
        Effect.annotateLogs({ cause: String(cause) }),
        Effect.andThen(Effect.fail(CommentaryFailed.make({ message: 'commentary failed' }))),
      ),
    ),
  );

/** Where a host keeps a built pack between asks. `address` is the pack's own
 *  URL on the host that was asked. */
export class CommentaryPacks extends Context.Service<
  CommentaryPacks,
  { readonly current: (address: string) => Effect.Effect<BuiltPack, CommentaryFailed> }
>()('@manna/egw-search/CommentaryPacks') {
  /** Kept in memory for `PACK_TTL` once built; a failed build is not kept. */
  static readonly layerMemory = Layer.effect(
    CommentaryPacks,
    Effect.gen(function* () {
      const db = yield* EGWParagraphDatabase;
      const cached = yield* Effect.cachedWithTTL(
        buildPack.pipe(Effect.provideService(EGWParagraphDatabase, db)),
        Exit.match({ onSuccess: () => PACK_TTL, onFailure: () => Duration.zero }),
      );
      return CommentaryPacks.of({ current: () => cached });
    }),
  );

  /** Kept in `store` under the pack's address: a pack found there is
   *  answered without reading the corpus; one built is put there. A store
   *  that cannot be read or written costs a build, never the answer. */
  static readonly layerStore = (store: PackStore) =>
    Layer.effect(
      CommentaryPacks,
      Effect.gen(function* () {
        const db = yield* EGWParagraphDatabase;
        const build = buildPack.pipe(Effect.provideService(EGWParagraphDatabase, db));
        return CommentaryPacks.of({
          current: (address) =>
            store.match(address).pipe(
              Effect.catchCause(() => Effect.succeed(Option.none<BuiltPack>())),
              Effect.flatMap(
                Option.match({
                  onSome: (pack: BuiltPack) => Effect.succeed(pack),
                  onNone: () =>
                    Effect.tap(build, (pack) =>
                      store
                        .put(address, pack)
                        .pipe(
                          Effect.catchCause((cause) =>
                            Effect.logWarning('commentary.pack.store_failed').pipe(
                              Effect.annotateLogs({ cause: String(cause) }),
                            ),
                          ),
                        ),
                    ),
                }),
              ),
            ),
        });
      }),
    );
}

/** A cache of built packs by address, such as the Worker's edge cache. */
export interface PackStore {
  readonly match: (address: string) => Effect.Effect<Option.Option<BuiltPack>, unknown>;
  readonly put: (address: string, pack: BuiltPack) => Effect.Effect<void, unknown>;
}

/** The pack as a Web response, the shape an edge cache keeps. Its
 *  `cache-control` makes the cache drop it after `PACK_TTL`. */
const packResponse = (pack: BuiltPack): Response =>
  new Response(pack.body, {
    headers: {
      'content-type': 'application/json',
      etag: etagOf(pack.version),
      'cache-control': CACHE_CONTROL,
    },
  });

/** A kept Web response read back as a pack: none when it carries no version. */
const packFromResponse = (response: Response): Effect.Effect<Option.Option<BuiltPack>, unknown> =>
  Option.match(Option.flatMap(Option.fromNullishOr(response.headers.get('etag')), versionOfEtag), {
    onNone: () => Effect.succeedNone,
    onSome: (version) =>
      Effect.map(
        Effect.tryPromise(() => response.text()),
        (body) => Option.some({ version, body }),
      ),
  });

/** The edge cache as a `PackStore`: the Worker passes the Cache API's
 *  `caches.open`, a test its own `Cache`. */
export const edgeStore = (open: () => Promise<Pick<Cache, 'match' | 'put'>>): PackStore => ({
  match: (address) =>
    Effect.gen(function* () {
      const cache = yield* Effect.tryPromise(open);
      const response = yield* Effect.tryPromise(() => cache.match(address));
      return yield* Option.match(Option.fromNullishOr(response), {
        onNone: () => Effect.succeedNone,
        onSome: packFromResponse,
      });
    }),
  put: (address, pack) =>
    Effect.gen(function* () {
      const cache = yield* Effect.tryPromise(open);
      yield* Effect.tryPromise(() => cache.put(address, packResponse(pack)));
    }),
});

const etagOf = (version: string): string => `"${version}"`;

const versionOfEtag = (tag: string): Option.Option<string> => {
  const match = /^(?:W\/)?"([^"]*)"$/.exec(tag.trim());
  return Option.fromNullishOr(match?.[1]);
};

/** Whether an `If-None-Match` value names `version`: a list of tags, weak or
 *  strong, bare or quoted, or `*`. */
export const namesVersion = (header: string, version: string): boolean =>
  header
    .split(',')
    .map((tag) => tag.trim())
    .some((tag) => tag === '*' || tag === version || Option.contains(versionOfEtag(tag), version));

const absoluteUrl = Option.liftThrowable((url: string) => new URL(url));

/** The pack's address on the host that was asked: its origin and the pack's
 *  path, with any query left out so a query cannot miss the cache. A Web
 *  request (the Worker's) carries its whole URL; else the `host` header
 *  names it. */
const addressOf = (request: HttpServerRequest.HttpServerRequest): string =>
  Option.match(
    Option.orElse(absoluteUrl(request.originalUrl), () => HttpServerRequest.toURL(request)),
    {
      onNone: () => `http://localhost${PACK_PATH}`,
      onSome: (url) => `${url.origin}${PACK_PATH}`,
    },
  );

export const CommentaryGroupLive = HttpApiBuilder.group(SearchApi, 'commentary', (handlers) =>
  Effect.gen(function* () {
    const packs = yield* CommentaryPacks;
    return handlers.handle('pack', ({ headers, request }) =>
      Effect.map(packs.current(addressOf(request)), (pack) => {
        const head = { etag: etagOf(pack.version), 'cache-control': CACHE_CONTROL };
        const asked = Option.fromUndefinedOr(headers['if-none-match']);
        if (Option.exists(asked, (tags) => namesVersion(tags, pack.version))) {
          return HttpServerResponse.empty({ status: 304, headers: head });
        }
        return HttpServerResponse.text(pack.body, {
          contentType: 'application/json',
          headers: head,
        });
      }),
    );
  }),
);

/** The commentary group over the corpus, its pack kept in memory: what the
 *  Bun server serves, and what a test harness of `SearchApi` serves over
 *  `EGWParagraphDatabase.Test()`. */
export const CommentaryMemoryLive = CommentaryGroupLive.pipe(
  Layer.provide(CommentaryPacks.layerMemory),
);
