/**
 * `GET /api/study/:name`: the reader's study packs (q126), as one file each.
 *
 * The packs are built from `bible.db`, which lives on the owner's Mac alone,
 * so neither host builds them: `bun run study:publish` builds them there and
 * uploads them. Each host reads them its own way (`StudyPacks`): the Worker
 * from the R2 bucket `heartseed-study-packs`, the Bun server from a
 * directory. A pack's version is read from its head, the field before its
 * body, so the server keeps no second record of it.
 */

import { Context, Effect, FileSystem, Layer, Option } from 'effect';
import { HttpServerResponse } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';

import { SearchApi, StudyFailed, StudyMissing, type STUDY_NAMES } from './api.js';
import { namesVersion } from './commentary-api.js';

/** A study pack's name. */
export type StudyName = (typeof STUDY_NAMES)[number];

/** A published pack: its version and its body. */
export interface StudyBody {
  readonly version: string;
  readonly body: string;
}

/** How long a pack may be cached downstream: an hour, as the commentary's. */
const CACHE_CONTROL = 'public, max-age=3600';

/** How far into a pack its version is looked for: the fields before its body. */
const HEAD = 256;

/** The version a pack's head names, as the phone's downloader reads it. */
export const studyVersionAt = (body: string): Option.Option<string> =>
  Option.fromNullishOr(/"version":"(\d+-[0-9a-f]{8})"/u.exec(body.slice(0, HEAD))?.[1]);

/** The object key of a pack, in a bucket or a directory. */
export const studyKey = (name: StudyName): string => `${name}.json`;

/** The pack read from `body`, or `StudyFailed` when its head names no version. */
const bodyOf = (name: StudyName, body: string): Effect.Effect<StudyBody, StudyFailed> =>
  Option.match(studyVersionAt(body), {
    onNone: () => Effect.fail(StudyFailed.make({ message: `study ${name}: no version` })),
    onSome: (version) => Effect.succeed({ version, body }),
  });

/** Where a host reads the published packs. */
export class StudyPacks extends Context.Service<
  StudyPacks,
  {
    readonly current: (name: StudyName) => Effect.Effect<Option.Option<StudyBody>, StudyFailed>;
  }
>()('@manna/egw-search/StudyPacks') {
  /** Read by `read`, a key's text or none: the Worker's R2 bucket, a test's map. */
  static readonly layerRead = (
    read: (key: string) => Effect.Effect<Option.Option<string>, unknown>,
  ) =>
    Layer.succeed(
      StudyPacks,
      StudyPacks.of({
        current: (name) =>
          read(studyKey(name)).pipe(
            Effect.mapError(() => StudyFailed.make({ message: `study ${name}: read failed` })),
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.succeedNone,
                onSome: (body) => Effect.asSome(bodyOf(name, body)),
              }),
            ),
          ),
      }),
    );

  /** Read from `directory` on the Bun server: none when the file is absent. */
  static readonly layerDirectory = (directory: string) =>
    Layer.unwrap(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return StudyPacks.layerRead((key) =>
          Effect.gen(function* () {
            const path = `${directory}/${key}`;
            if (!(yield* fs.exists(path))) return Option.none<string>();
            return Option.some(yield* fs.readFileString(path));
          }),
        );
      }),
    );
}

export const StudyGroupLive = HttpApiBuilder.group(SearchApi, 'study', (handlers) =>
  Effect.gen(function* () {
    const packs = yield* StudyPacks;
    return handlers.handle('pack', ({ params, headers }) =>
      packs.current(params.name).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(StudyMissing.make({ name: params.name })),
            onSome: (pack) => {
              const head = { etag: `"${pack.version}"`, 'cache-control': CACHE_CONTROL };
              const asked = Option.fromUndefinedOr(headers['if-none-match']);
              if (Option.exists(asked, (tags) => namesVersion(tags, pack.version)))
                return Effect.succeed(HttpServerResponse.empty({ status: 304, headers: head }));
              return Effect.succeed(
                HttpServerResponse.text(pack.body, {
                  contentType: 'application/json',
                  headers: head,
                }),
              );
            },
          }),
        ),
      ),
    );
  }),
);

/** The study group over `packs`, by key (none published by default): what a test harness of `SearchApi` serves. */
export const studyGroupOver = (packs: ReadonlyMap<string, string> = new Map()) =>
  StudyGroupLive.pipe(
    Layer.provide(
      StudyPacks.layerRead((key) => Effect.succeed(Option.fromUndefinedOr(packs.get(key)))),
    ),
  );
