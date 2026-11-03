import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import type { Raster } from '../../core/raster.ts';
import { launchArgs } from '../../tools/browser.ts';
import { openView } from '../../tools/chrome.ts';

export interface PlateAt {
  readonly module: string;
  readonly name: string;
  readonly move: { readonly x: number; readonly y: number; readonly s: number };
  readonly T: number;
}

export interface PlateFrames {
  readonly painted: Raster;
  readonly bare: Raster;
  readonly matrix: { a: number; b: number; c: number; d: number; e: number; f: number };
}

const FILM = new URL('../..', import.meta.url).pathname;

const literal = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const entry = (at: PlateAt) => `
import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import * as M from ${literal(at.module)};
import { createFilm } from ${literal(`${FILM}canvas/film.ts`)};
import { loadPaintings } from ${literal(`${FILM}painting/load.ts`)};
import { PaintingImagesBrowser } from ${literal(`${FILM}painting/images-browser.ts`)};

const spec = M[${literal(at.name)}];
const move = ${literal(at.move)};
const base64Of = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
let matrix;
const filmOf = (paint) =>
  createFilm({
    fps: 30,
    title: 'plate',
    paper: { base: '#f2eada', tone: '#8a7a60', seed: 7 },
    shade: '#000000',
    finish: { vignette: 0, grain: 0 },
    scenes: [
      {
        id: 'plate',
        min: 4,
        paintings: { plate: spec },
        draw: (f) => {
          f.ctx.translate(move.x, move.y);
          f.ctx.scale(move.s, move.s);
          if (!paint) return;
          const m = f.ctx.getTransform();
          matrix = { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
          f.painting('plate');
        },
      },
    ],
  });
const frameOf = (film) => {
  const canvas = document.createElement('canvas');
  canvas.width = film.width;
  canvas.height = film.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  film.render(ctx, ${literal(at.T)});
  return { width: film.width, height: film.height, rgba: base64Of(new Uint8Array(ctx.getImageData(0, 0, film.width, film.height).data.buffer)) };
};
try {
  const images = PaintingImagesBrowser.pipe(Layer.provide(FetchHttpClient.layer));
  const painted = filmOf(true);
  const bare = filmOf(false);
  const frames = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* loadPaintings(painted);
        yield* loadPaintings(bare);
        return { painted: frameOf(painted), bare: frameOf(bare) };
      }),
    ).pipe(Effect.provide(images)),
  );
  window.probe = { ...frames, matrix };
  window.ready = true;
} catch (e) {
  window.loadError = String(e && e.stack ? e.stack : e);
}
`;

const INDEX =
  '<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="/entry.js"></script></body></html>';

const LOADED = `new Promise((done) => { const t0 = Date.now(); const look = () => window.ready ? done('ready') : window.loadError ? done('error: ' + window.loadError) : Date.now() - t0 > 60000 ? done('timeout') : setTimeout(look, 20); look(); })`;

const served = (out: string, path: Path.Path) =>
  Effect.acquireRelease(
    Effect.sync(() =>
      // oxlint-disable-next-line effect/noGlobals -- the fixture page's own loopback server, for the scope
      Bun.serve({
        port: 0,
        hostname: '127.0.0.1',
        fetch: (req) =>
          // oxlint-disable-next-line effect/noGlobals -- a built file of the fixture page, served as it is
          new Response(Bun.file(path.join(out, decodeURIComponent(new URL(req.url).pathname))), {
            headers: Option.match(
              Option.liftPredicate(req.url, (u) => u.endsWith('.js')),
              {
                onNone: () => ({}),
                onSome: () => ({ 'content-type': 'text/javascript' }),
              },
            ),
          }),
        error: () => new Response('', { status: 404 }),
      }),
    ),
    (s) => Effect.promise(() => s.stop(true)),
  );

interface Drawn {
  readonly width: number;
  readonly height: number;
  readonly rgba: string;
}

const rasterOf = (d: Drawn): Raster => ({
  width: d.width,
  height: d.height,
  rgba: Uint8Array.from(Buffer.from(d.rgba, 'base64')),
});

export const plateFrames = Effect.fn('test.plateFrames')(function* (at: PlateAt) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const cache = path.join(FILM, '..', 'node_modules', '.cache', 'painting-page');
  yield* fs.makeDirectory(cache, { recursive: true });
  const dir = yield* fs.makeTempDirectoryScoped({ directory: cache });
  const main = path.join(dir, 'entry.ts');
  yield* fs.writeFileString(main, entry(at));
  const out = path.join(dir, 'out');
  yield* Effect.promise(() =>
    Bun.build({
      entrypoints: [main],
      outdir: out,
      target: 'browser',
      publicPath: '/',
      throw: true,
    }),
  );
  yield* fs.writeFileString(path.join(out, 'index.html'), INDEX);
  const server = yield* served(out, path);
  const view = yield* openView(launchArgs, { width: 1920, height: 1080 });
  yield* Effect.promise(() => view.navigate(`http://127.0.0.1:${server.port}/index.html`));
  const state = yield* Effect.promise(() => view.evaluate<string>(LOADED));
  if (state !== 'ready') return yield* Effect.die(new Error(`painting page: ${state}`));
  const drawn = yield* Effect.promise(() =>
    view.evaluate<{ painted: Drawn; bare: Drawn; matrix: PlateFrames['matrix'] }>('window.probe'),
  );
  const frames: PlateFrames = {
    painted: rasterOf(drawn.painted),
    bare: rasterOf(drawn.bare),
    matrix: drawn.matrix,
  };
  return frames;
});
