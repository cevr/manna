import * as BunHttpPlatform from '@effect/platform-bun/BunHttpPlatform';
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { LAB_PAGES, LAB_SERVERS } from '../../../../apps/animations/server.ts';
import { pageHref } from '../core/api.ts';
import { LabPage, PageBundler } from './lab-page.ts';
import { PageReads } from './api-server.ts';
import { PageRenderer } from './page-render.ts';

const STUDIO = [pageHref.ask('a1'), pageHref.askPage('a1')];

const RENDER_MARK = 'window.__film=';

const NOTHING_READ = PageReads.of({
  read: () => Effect.succeed(new Response('{}', { status: 404 })),
});

const headScripts = (html: string) =>
  Array.from(
    html.matchAll(/<(?:script\b[^>]*\bsrc|link\b[^>]*rel="modulepreload"[^>]*\bhref)="([^"]+)"/g),
    (m) => m[1] ?? '',
  );

const staticImports = (script: string) =>
  Array.from(script.matchAll(/(?:from|import)\s*"(\/[^"]+\.js)"/g), (m) => m[1] ?? '');

describe("the render page's code", () => {
  it.live('no lab page loads it, as the lab builds the pages together', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const films = yield* fs.makeTempDirectoryScoped({ prefix: 'film-page-graph-' });
      const page = Context.get(
        yield* Layer.build(
          LabPage.layer({
            pages: LAB_PAGES,
            servers: LAB_SERVERS,
            films,
            footage: { dir: `${films}/footage`, out: `${films}/out` },
          }).pipe(Layer.provide([PageBundler.layer, PageRenderer.layer])),
        ),
        LabPage,
      );
      const ask = (pathname: string) =>
        Effect.gen(function* () {
          const request = HttpServerRequest.fromWeb(
            new Request(`http://127.0.0.1:8229${pathname}`, {
              headers: { host: '127.0.0.1:8229' },
            }),
          );
          const response = HttpServerResponse.toWeb(
            yield* page.answer.pipe(
              Effect.provideService(HttpServerRequest.HttpServerRequest, request),
              Effect.provideService(PageReads, NOTHING_READ),
            ),
          );
          return yield* Effect.promise(() => response.text());
        });
      const loaded = (href: string) =>
        Effect.gen(function* () {
          const scripts = new Map<string, string>();
          const queue = headScripts(yield* ask(href));
          for (const next of queue) {
            if (scripts.has(next)) continue;
            const script = yield* ask(next);
            scripts.set(next, script);
            queue.push(...staticImports(script));
          }
          return scripts;
        });
      const render = yield* loaded(pageHref.export('f'));
      expect([...render.values()].some((script) => script.includes(RENDER_MARK))).toBe(true);
      const holding = yield* Effect.forEach(STUDIO, (href) =>
        Effect.map(loaded(href), (scripts) => ({
          href,
          scripts: scripts.size,
          render: [...scripts]
            .filter(([, script]) => script.includes(RENDER_MARK))
            .map(([path]) => path),
        })),
      );
      expect(holding.filter((p) => p.scripts === 0 || p.render.length > 0)).toEqual([]);
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.provideMerge(BunHttpPlatform.layer, BunServices.layer)),
    ),
  );
});
