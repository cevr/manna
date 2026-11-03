import {
  CACHE,
  type FootageRoot,
  boardFile,
  footageHandler,
  narrationFile,
} from '@manna/film/tools';
import { BunServices } from '@effect/platform-bun';
import { Effect, Option } from 'effect';
import { join } from 'node:path';
import index from './index.html';

export const FILMS = join(import.meta.dir, 'src/films');

export const RENDER_PAGE: string = index.index;

export const LAB_PAGES = {
  ask: join(import.meta.dir, 'ask.html'),
  render: RENDER_PAGE,
};

export const LAB_SERVERS: Partial<Record<keyof typeof LAB_PAGES, string>> = {
  ask: join(import.meta.dir, 'src/ask.server.tsx'),
};

const HOST = '127.0.0.1';

export const serve = (port: number, films: string, footage: FootageRoot) => {
  const spoken = narration(films);
  return Bun.serve({
    hostname: HOST,
    port,
    development: false,
    routes: {
      '/': index,
      '/films/*': (req) => spoken(new URL(req.url).pathname),
      '/footage/*': footageHandler(footage),
    },
  });
};

export const narration = (films: string) => (pathname: string) =>
  Effect.runPromise(
    Effect.map(
      Effect.all([narrationFile(films, pathname), boardFile(films, pathname)]),
      ([spoken, board]) => Option.orElse(spoken, () => board),
    ).pipe(
      Effect.map(
        Option.match({
          onNone: () => new Response('not found', { status: 404 }),
          onSome: (file) =>
            new Response(Bun.file(file), { headers: { 'Cache-Control': CACHE.fresh } }),
        }),
      ),
      Effect.provide(BunServices.layer),
    ),
  );
