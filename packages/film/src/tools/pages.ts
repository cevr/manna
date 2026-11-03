import { Array as Arr, Context, Effect, Layer, Option, Pool, Predicate, type Scope } from 'effect';
import type { CallAnswers, CallArgs, ExportCall, ExportInfo } from '../core/export-handle.ts';
import { Browser, type CallErrors, type FramePage, type PageOpenError } from './browser.ts';
import type { PageCrashed, PageError } from './errors.ts';
import { PreviewServer } from './preview-server.ts';
import { Picture, pictureParams } from '../core/board-render.ts';

export interface PagesOptions {
  readonly workers: number;
  readonly captions: boolean;
  readonly server: Option.Option<string>;
  readonly picture?: Picture;
}

export interface ExportPages {
  readonly info: ExportInfo;
  readonly title: string;
  readonly use: <A, E, R>(
    use: (page: FramePage) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | PageOpenError, R>;
  readonly call: <K extends ExportCall>(
    name: K,
    ...args: CallArgs[K]
  ) => Effect.Effect<CallAnswers[K], PageOpenError | PageError | PageCrashed | CallErrors[K]>;
}

interface PagesService {
  readonly open: (
    film: string,
    options: PagesOptions,
  ) => Effect.Effect<ExportPages, PageOpenError, Scope.Scope>;
}

export const exportUrl = (
  server: string,
  film: string,
  captions: boolean,
  picture: Picture = Picture.Scenes({ review: false }),
): string =>
  `${server}?${[
    `film=${encodeURIComponent(film)}`,
    'export',
    ...Arr.filter(['captions=0'], () => !captions),
    ...pictureParams(picture),
  ].join('&')}`;

export class Pages extends Context.Service<Pages, PagesService>()('@manna/film/tools/Pages') {
  static readonly layer = Layer.effect(
    Pages,
    Effect.gen(function* () {
      const browser = yield* Browser;
      const server = yield* PreviewServer;

      const open = Effect.fn('Pages.open')(function* (film: string, options: PagesOptions) {
        const pool = yield* Pool.make({
          acquire: browser.open(
            exportUrl(
              Option.getOrElse(options.server, () => server.url),
              film,
              options.captions,
              options.picture,
            ),
          ),
          size: Math.max(1, options.workers),
        });
        const use = <A, E, R>(run: (page: FramePage) => Effect.Effect<A, E, R>) =>
          Effect.scoped(
            Effect.flatMap(Pool.get(pool), (page) =>
              run(page).pipe(
                Effect.tapError((error) =>
                  Effect.when(
                    Pool.invalidate(pool, page),
                    Effect.succeed(Predicate.isTagged(error, 'PageCrashed')),
                  ),
                ),
              ),
            ),
          );
        const first = yield* use((page) => Effect.succeed(page));
        yield* Effect.log(`pages.open page=${film} workers=${Math.max(1, options.workers)}`);
        return {
          info: first.info,
          title: first.title,
          use,
          call: <K extends ExportCall>(name: K, ...args: CallArgs[K]) =>
            use((page) => page.call(name, ...args)),
        } satisfies ExportPages;
      });

      return Pages.of({ open });
    }),
  );
}
