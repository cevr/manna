// The app's render page (`index.html`), with each film's recorded narration
// and its Board (what `film render --board` draws), on loopback for as long
// as `render` or `check` runs (the film CLI's PreviewServer, cli.ts, at
// `/?film=<name>&export`), and the pages the lab builds (`LAB_PAGES`). The
// lab's own server is the framework's (`labServer`): `bun run lab`.

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

/** The films folder: the player imports its registry, and the film CLI reads each film here. */
export const FILMS = join(import.meta.dir, 'src/films');

/**
 * The lab's pages, each this app's HTML entry: its asks, and its render
 * page, whose handle the easel draws a look through (`film lab look`, at a
 * film's export page). The places each is served at are the framework's
 * (`Places`, `pageAt`); `film lab` serves these.
 */
export const LAB_PAGES = {
  ask: join(import.meta.dir, 'ask.html'),
  render: join(import.meta.dir, 'index.html'),
};

/**
 * The pages the lab renders on the server, each by its server entry: the
 * same components as its HTML entry's script, with none of the app's films
 * (the server never imports a film's modules: Fresh reads; the lab refuses
 * a build whose server entry does, `filmCode`). The render
 * page has no shell and no server entry: it is drawn in the browser alone.
 */
export const LAB_SERVERS: Partial<Record<keyof typeof LAB_PAGES, string>> = {
  ask: join(import.meta.dir, 'src/ask.server.tsx'),
};

/** The loopback interface: the only one the player listens on. */
const HOST = '127.0.0.1';

/**
 * The player on `HOST`:`port`, its narration served from `films` and its
 * talks' footage from `footage` (`footageHandler`: each copy by range, as the
 * export decodes it).
 */
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

/**
 * The narration route, `/films/<film>/narration/<file>`, for the player: the file the framework's `narrationFile`
 * names, else the board file its `boardFile` names (`/films/<film>/board.json`,
 * `/films/<film>/board/<image>`), else a 404. The studio rewrites these files
 * in place (a take kept, the track remixed, a try kept), so the browser asks
 * again on every load rather than play a take it cached.
 */
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
