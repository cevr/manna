import * as BunHttpPlatform from '@effect/platform-bun/BunHttpPlatform';
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Option, Struct } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { Place } from '@manna/url-state';
import { LAB_PAGES, LAB_SERVERS } from '../../../../apps/animations/server.ts';
import { Places } from '../core/api.ts';
import { PLACE_HREFS } from '../lab/fixtures/places.ts';
import { LabPage, PageBundler } from './lab-page.ts';
import { PageReads } from './api-server.ts';
import { PageRenderer } from './page-render.ts';

const BUDGET = 64 * 1024;

const OWN_STYLES: ReadonlyArray<keyof typeof PLACE_HREFS> = ['ask'];

const attribute = (tag: string, name: string): string =>
  new RegExp(`\\b${name}=(?:"([^"]*)"|([^\\s>]+))`).exec(tag)?.slice(1).join('') ?? '';

const blockingCss = <R>(html: string, size: (href: string) => Effect.Effect<number, never, R>) =>
  Effect.gen(function* () {
    const head = html.slice(0, Math.max(0, html.indexOf('</head>')));
    const linked = yield* Effect.forEach(
      Array.from(head.matchAll(/<link\b[^>]*>/g), (m) => m[0]).filter(
        (tag) => attribute(tag, 'rel') === 'stylesheet',
      ),
      (tag) => size(attribute(tag, 'href')),
    );
    const held = Array.from(
      html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g),
      (m) => new TextEncoder().encode(m[1] ?? '').byteLength,
    );
    return [...linked, ...held].reduce((sum, bytes) => sum + bytes, 0);
  });

const placeCss = (html: string): number =>
  Array.from(
    html.matchAll(/<style\b[^>]*\bdata-place-style\b[^>]*>([\s\S]*?)<\/style>/g),
    (m) => new TextEncoder().encode(m[1] ?? '').byteLength,
  ).reduce((sum, bytes) => sum + bytes, 0);

const NOTHING_READ = PageReads.of({
  read: () => Effect.succeed(new Response('{}', { status: 404 })),
});

describe("a page's render-blocking CSS", () => {
  it.live(
    'every place a phone opens holds at most the budget, as the lab builds, renders and answers it',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const films = yield* fs.makeTempDirectoryScoped({ prefix: 'film-css-budget-' });
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
            return { status: response.status, body: yield* Effect.promise(() => response.text()) };
          });
        const size = (href: string) =>
          Effect.map(ask(href), ({ status, body }) => {
            if (status !== 200) return Number.POSITIVE_INFINITY;
            return new TextEncoder().encode(body).byteLength;
          });
        expect(
          Struct.keys(PLACE_HREFS).filter((place) => {
            const at: Place.Place<unknown> = Places[place];
            return Option.isNone(Place.decode(at, PLACE_HREFS[place]));
          }),
        ).toEqual([]);
        const weighed = yield* Effect.forEach(Struct.keys(PLACE_HREFS), (place) =>
          Effect.gen(function* () {
            const { status, body } = yield* ask(PLACE_HREFS[place]);
            const rendered = status === 200 && body.includes('<style data-page-style');
            const bytes = yield* blockingCss(body, size);
            const own = placeCss(body);
            yield* Effect.logInfo(
              `page.css.weighed place=${place} bytes=${bytes} own=${own} margin=${BUDGET - bytes}`,
            );
            return { place, rendered, bytes, own };
          }),
        );
        expect(weighed.filter(({ rendered, bytes }) => !rendered || bytes > BUDGET)).toEqual([]);
        expect(weighed.filter(({ place, own }) => OWN_STYLES.includes(place) && own === 0)).toEqual(
          [],
        );
      }).pipe(
        Effect.scoped,
        Effect.provide(Layer.provideMerge(BunHttpPlatform.layer, BunServices.layer)),
      ),
  );
});
