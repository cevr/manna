import {
  Boolean as Bool,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Result,
  Schema,
} from 'effect';
import { REVIEW_FILES, labUrls } from '../core/api.ts';
import { type Ask, type Material, imagesIn, materialsIn, scriptSource } from '../core/ask.ts';
import { panelById } from '../core/board.ts';
import {
  EVIDENCE_FILE,
  EVIDENCE_PAGE,
  ReviewRecordJson,
  evidenceProblems,
  keptOn,
  typingProblems,
} from '../core/review-record.ts';
import { type ReviewIndex, docAt, videoAt } from '../core/review.ts';
import { Segment } from '../core/segment.ts';
import { decodeComponent } from '@manna/url-state';
import { BoardStore } from './board-store.ts';
import type { ContentStore } from './content-store.ts';
import type { FilmFolder } from './film-repo.ts';
import { filmNamed } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';
import { NotesStore } from './notes-store.ts';
import { Review } from './review.ts';
import { refFromUrl } from './review-http.ts';
import { SeriesDrafts } from './series-drafts.ts';
import type { StudioReadings } from './studio.ts';
import { beatAttempts } from './studio.ts';
import type { Takes } from './takes.ts';

interface Aimed {
  readonly production?: string;
  readonly productionFilm?: string;
  readonly set?: string;
  readonly override?: { readonly quote: string };
}

interface AskMaterialsService {
  readonly problems: (ask: Ask) => Effect.Effect<ReadonlyArray<string>>;
  readonly served: (ask: Ask) => Effect.Effect<ReadonlyArray<readonly [string, Served]>>;
  readonly evidence: (aimed: Aimed, ask: Ask) => Effect.Effect<ReadonlyArray<string>>;
}

type Served =
  | { readonly _tag: 'File'; readonly file: string }
  | { readonly _tag: 'Frame' }
  | { readonly _tag: 'None' };

const NOT_SERVED: Served = { _tag: 'None' };
const FRAME_SERVED: Served = { _tag: 'Frame' };
const fileServed = (file: string): Served => ({ _tag: 'File', file });

const problemIf = (wrong: boolean, problem: string): ReadonlyArray<string> =>
  Bool.match(wrong, { onFalse: () => [], onTrue: () => [problem] });

const FILM_IMAGE = /^\/api\/films\/([^/]+)\/(board\/files|stills)\/([^/]+)$/;

const FRAME = labUrls.review.frame({ query: { ref: '' } }).split('?')[0];

const decoded = (component: string): Option.Option<string> =>
  Result.getSuccess(decodeComponent(component));

const unknownOf = (
  named: Option.Option<ReadonlyArray<string>>,
  known: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  Option.match(named, {
    onNone: () => [],
    onSome: (list) => list.filter((id) => !known.includes(id)),
  });

export class AskMaterials extends Context.Service<AskMaterials, AskMaterialsService>()(
  '@manna/film/tools/AskMaterials',
) {
  static readonly layer = Layer.effect(
    AskMaterials,
    Effect.gen(function* () {
      const review = yield* Review;
      const fresh = yield* FreshFilm;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const drafts = yield* SeriesDrafts;
      const boards = yield* BoardStore;
      const films = yield* Effect.context<FilmFolder>();
      const studio = yield* Effect.context<StudioReadings | Takes | ContentStore | FilmFolder>();
      const notes = yield* NotesStore;

      const film = (where: string, name: string) =>
        filmNamed(name).pipe(
          Effect.provideContext(films),
          Effect.mapError(() => `${where}: the lab has no film ${name}`),
        );

      const indexed = <A>(find: (index: ReviewIndex) => Option.Option<A>) =>
        Effect.gen(function* () {
          const had = find(yield* review.index(false));
          if (Option.isSome(had)) return had;
          return find(yield* review.index(true));
        });

      const unread =
        (where: string, what: string) =>
        (error: { readonly message: string }): string =>
          `${where}: ${what} cannot be read: ${error.message}`;

      const found = (
        step: string,
        block: Material,
      ): Effect.Effect<ReadonlyArray<string>, string> => {
        const where = `step ${step}`;
        switch (block.kind) {
          case 'document':
            return Effect.gen(function* () {
              if (Option.isNone(yield* indexed((index) => docAt(index, block.ref))))
                return [
                  `${where}: no document ${block.ref} is listed by the review (a set's Markdown, as \`sets\` lists it)`,
                ];
              yield* review.resolve(block.ref).pipe(Effect.mapError(unread(where, block.ref)));
              return [];
            });
          case 'video':
            return Effect.gen(function* () {
              if (Option.isNone(yield* indexed((index) => videoAt(index, block.ref))))
                return [
                  `${where}: no video ${block.ref} is listed by the review (a set's video, as \`sets\` lists it)`,
                ];
              yield* review.resolve(block.ref).pipe(Effect.mapError(unread(where, block.ref)));
              return [];
            });
          case 'script': {
            const named = Option.fromUndefinedOr(block.beats);
            const source = scriptSource(block);
            if (source._tag === 'Film')
              return Effect.gen(function* () {
                const read = yield* fresh
                  .script(yield* film(where, source.film))
                  .pipe(Effect.mapError(unread(where, `the script of ${source.film}`)));
                return unknownOf(
                  named,
                  read.map((b) => b.id),
                ).map((id) => `${where}: the script of ${source.film} has no beat ${id}`);
              });
            const { series, draft } = source;
            return Effect.gen(function* () {
              const read = yield* drafts
                .read(series, draft)
                .pipe(Effect.mapError(unread(where, `draft ${series}/${draft}`)));
              return unknownOf(
                named,
                read.beats.map((b) => b.id),
              ).map((id) => `${where}: draft ${series}/${draft} has no beat ${id}`);
            });
          }
          case 'board':
            return Effect.gen(function* () {
              const named = yield* film(where, block.film);
              const board = yield* boards
                .read(named)
                .pipe(Effect.mapError(unread(where, `the Board of ${block.film}`)));
              if (board.panels.length === 0)
                return [`${where}: the Board of ${block.film} has no panel yet`];
              return Option.match(Option.fromUndefinedOr(block.panels), {
                onNone: () => [],
                onSome: (panels) =>
                  panels
                    .filter((id) => Option.isNone(panelById(board, id)))
                    .map((id) => `${where}: the Board of ${block.film} has no panel ${id}`),
              });
            });
          case 'audio':
            return Effect.gen(function* () {
              yield* film(where, block.film);
              const read = yield* beatAttempts({ film: block.film, beat: block.beat }).pipe(
                Effect.provideContext(studio),
                Effect.mapError((error) =>
                  Bool.match(Predicate.isTagged(error, 'UnknownScene'), {
                    onTrue: () => `${where}: ${block.film} has no beat ${block.beat}`,
                    onFalse: () => unread(where, `the takes of ${block.film} ${block.beat}`)(error),
                  }),
                ),
              );
              return Option.match(Option.fromUndefinedOr(block.attempt), {
                onSome: (attempt) =>
                  problemIf(
                    !read.attempts.some((a) => a.file === attempt),
                    `${where}: ${block.film} ${block.beat} has no take ${attempt}`,
                  ),
                onNone: () =>
                  problemIf(
                    !read.attempts.some((a) => a.kept) && Predicate.isUndefined(read.staged),
                    `${where}: ${block.film} ${block.beat} has no take: name an attempt`,
                  ),
              });
            });
        }
      };

      const servedAt = (src: string): Effect.Effect<Served> => {
        const url = new URL(src, 'http://lab.invalid');
        const filmImage = Option.flatMap(Option.fromNullishOr(FILM_IMAGE.exec(url.pathname)), (m) =>
          Option.all([
            Option.flatMap(Option.fromUndefinedOr(m[1]), decoded),
            Option.fromUndefinedOr(m[2]),
            Option.flatMap(Option.fromUndefinedOr(m[3]), decoded),
          ]),
        );
        const reads: ReadonlyArray<Option.Option<Effect.Effect<Served, unknown>>> = [
          Option.map(refFromUrl(src, REVIEW_FILES), (ref) =>
            Effect.map(review.resolve(ref), fileServed),
          ),
          Option.map(filmImage, ([name, route, file]) =>
            Effect.flatMap(Effect.provideContext(filmNamed(name), films), (named) =>
              Bool.match(route === 'stills', {
                onTrue: () =>
                  Effect.map(
                    notes.still(named, file),
                    Option.match({ onNone: () => NOT_SERVED, onSome: fileServed }),
                  ),
                onFalse: () =>
                  Effect.flatMap(
                    Effect.fromOption(
                      Option.match(Option.fromNullishOr(url.searchParams.get('folder')), {
                        onNone: () => Option.some(Option.none<Segment>()),
                        onSome: (folder) =>
                          Option.map(Schema.decodeOption(Segment)(folder), Option.some),
                      }),
                    ),
                    (folder) =>
                      Effect.map(
                        boards.image(named, file, Option.getOrUndefined(folder)),
                        fileServed,
                      ),
                  ),
              }),
            ),
          ),
          Option.map(
            Option.filter(
              Option.fromNullishOr(url.searchParams.get('ref')),
              () => url.pathname === FRAME,
            ),
            (ref) =>
              Effect.map(
                indexed((index) => videoAt(index, ref)),
                Option.match({ onNone: (): Served => NOT_SERVED, onSome: () => FRAME_SERVED }),
              ),
          ),
        ];
        return Option.match(Option.firstSomeOf(reads), {
          onNone: () => Effect.succeed(NOT_SERVED),
          onSome: (read) => Effect.orElseSucceed(read, () => NOT_SERVED),
        });
      };

      const srcsOf = (ask: Ask) => [
        ...new Set(
          imagesIn(ask).flatMap((image) => Option.toArray(Option.fromUndefinedOr(image.src))),
        ),
      ];

      const served = (ask: Ask) =>
        Effect.forEach(srcsOf(ask), (src) => Effect.map(servedAt(src), (at) => [src, at] as const));

      const problems = (ask: Ask) =>
        Effect.map(
          Effect.forEach(materialsIn(ask), ({ step, block }) =>
            found(step, block).pipe(Effect.catch((problem) => Effect.succeed([problem]))),
          ),
          (each) => each.flat(),
        );

      const recordOf = (set: string) =>
        Effect.gen(function* () {
          const page = yield* review
            .resolve(`${set}/${EVIDENCE_PAGE}`)
            .pipe(
              Effect.mapError(
                () =>
                  `set ${set} holds no review record (${EVIDENCE_PAGE}): run film review <film> --set <name> --scene <id> --at <place> --at <place> before asking to keep`,
              ),
            );
          const file = path.join(path.dirname(path.dirname(page)), EVIDENCE_FILE);
          const text = yield* fs
            .readFileString(file)
            .pipe(
              Effect.mapError(
                () => `set ${set} lists ${EVIDENCE_PAGE} but has no ${EVIDENCE_FILE}`,
              ),
            );
          return yield* Schema.decodeEffect(ReviewRecordJson)(text).pipe(
            Effect.mapError((error) => `${file} does not read: ${error.message}`),
          );
        });

      const keysNow = (film: string) =>
        fresh.project([film, '--json']).pipe(
          Effect.map((project) => new Map(project.scenes.map((s) => [s.scene, s.key]))),
          Effect.mapError((error) => `${film}'s scenes cannot be read now: ${error.message}`),
        );

      const evidence = (aimed: Aimed, ask: Ask) =>
        Option.match(Option.fromUndefinedOr(aimed.production), {
          onNone: () => Effect.succeed([]),
          onSome: (production) =>
            Effect.gen(function* () {
              const kept = keptOn(ask);
              const typed = typingProblems(
                ask,
                production,
                Option.fromUndefinedOr(aimed.productionFilm),
              );
              if (kept.length === 0) return typed;
              if (Predicate.isNotUndefined(aimed.override)) {
                yield* Effect.log(
                  `asks.evidence override production=${production} chars=${aimed.override.quote.length}`,
                );
                return typed;
              }
              const needed = Effect.gen(function* () {
                const set = yield* Effect.fromOption(Option.fromUndefinedOr(aimed.set)).pipe(
                  Effect.mapError(
                    () =>
                      "name the set that holds the figures' review record (`set`), or override with the owner's own words",
                  ),
                );
                const record = yield* recordOf(set);
                return yield* Effect.forEach(kept, ({ which, keeps }) =>
                  Effect.map(keysNow(keeps.film), (now) =>
                    evidenceProblems(record, keeps, now).map(
                      (p) => `${which}: a keep needs evidence: ${p}`,
                    ),
                  ).pipe(
                    Effect.catch((p) => Effect.succeed([`${which}: a keep needs evidence: ${p}`])),
                  ),
                );
              }).pipe(
                Effect.map((each) => each.flat()),
                Effect.catch((p) =>
                  Effect.succeed(kept.map(({ which }) => `${which}: a keep needs evidence: ${p}`)),
                ),
              );
              return [...typed, ...(yield* needed)];
            }),
        });

      return AskMaterials.of({ problems, served, evidence });
    }),
  );
}
