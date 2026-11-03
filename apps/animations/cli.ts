import { PreviewServer, runFilmCli } from '@manna/film/tools';
import { Config, Effect, Layer, Path } from 'effect';
import { checkoutRootsOf } from './checkouts.ts';
import { CRITIQUE_RULES, JUDGE_RULES } from './rules.ts';
import { FILMS, LAB_PAGES, LAB_SERVERS, serve } from './server.ts';

export const SOUNDS = `${import.meta.dir}/sounds`;

export const FOOTAGE = `${import.meta.dir}/footage`;

const HOUSE_LOOK = {
  text: `${import.meta.dir}/docs/ref/house-look.txt`,
  image: `${import.meta.dir}/docs/ref/house-look.png`,
};

const SERIES = `${import.meta.dir}/series`;

export const FOLDERS = {
  out: `${import.meta.dir}/out`,
  lab: `${import.meta.dir}/lab`,
  productions: `${import.meta.dir}/productions`,
};

const player = (films: string) =>
  Layer.effect(
    PreviewServer,
    Effect.gen(function* () {
      const out = yield* Config.String('FILMS_OUT').pipe(Config.withDefault(FOLDERS.out));
      const server = yield* Effect.acquireRelease(
        Effect.sync(() => serve(0, films, { dir: FOOTAGE, out })),
        (running) => Effect.promise(() => running.stop(true)),
      );
      return PreviewServer.of({ url: server.url.href });
    }),
  );

const labAt = Effect.gen(function* () {
  const port = yield* Config.Int('LAB_PORT').pipe(Config.withDefault(8229));
  const hostname = yield* Config.String('LAB_HOST').pipe(Config.withDefault('127.0.0.1'));
  return { port, hostname };
});

const checkoutRoots = Effect.flatMap(Path.Path, (path) =>
  checkoutRootsOf(path.resolve(import.meta.dir, '..', '..')),
);

export const appCli = (films: string, sounds: string, self: string): void =>
  runFilmCli<Config.ConfigError>({
    films,
    sounds,
    footage: FOOTAGE,
    series: SERIES,
    folders: FOLDERS,
    previewServer: player(films),
    lab: {
      at: labAt,
      pages: { pages: LAB_PAGES, servers: LAB_SERVERS },
      roots: checkoutRoots,
    },
    self: ['bun', self],
    judge: { rules: JUDGE_RULES },
    critique: { rules: CRITIQUE_RULES },
    house: HOUSE_LOOK,
  });

if (import.meta.main) appCli(FILMS, SOUNDS, import.meta.path);
