// A page that draws one puppet, for its slow test and the parity receipt: the
// puppet a module declares (`module`'s export `name`, at `key` when given)
// loaded as a film's are (`puppetFrom` over the page's image decoder) and
// drawn by the draw path (`drawPuppet`, `canvas/puppet-gl.ts`) at a pose, in
// its sheet's frame on a clear canvas the sheet's size, in the render path's
// own Chrome (`openView(launchArgs)`). The page is built with Bun's bundler
// into a folder under the package's `node_modules/.cache` (so `effect`
// resolves from the package) and served on loopback for the scope.

import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import type { PuppetLook } from '../../canvas/puppet.ts';
import type { PuppetPose } from '../../core/puppet.ts';
import type { Raster } from '../../core/raster.ts';
import { launchArgs } from '../../tools/browser.ts';
import { openView } from '../../tools/chrome.ts';

/** Where the puppet is declared: a module's export, and the key under it when the export is a table. */
export interface PuppetAt {
  readonly module: string;
  readonly name: string;
  readonly key?: string;
}

/** The page's calls: a pose drawn (with a look when given) and read back, and the ms of each of `poses` drawn into a 1920 × 1080 frame. */
export interface PuppetPage {
  readonly draw: (pose: PuppetPose, look?: PuppetLook) => Effect.Effect<Raster>;
  readonly time: (
    poses: ReadonlyArray<PuppetPose>,
    look?: PuppetLook,
  ) => Effect.Effect<ReadonlyArray<number>>;
  readonly renderer: string;
}

const FILM = new URL('../..', import.meta.url).pathname;

/** `v` as a JavaScript literal in the page's source. */
const literal = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** A look as the page's source passes it: `undefined` for none. */
const lookOf = (look?: PuppetLook) =>
  Option.match(Option.fromUndefinedOr(look), { onNone: () => 'undefined', onSome: literal });

const entry = (at: PuppetAt) => `
import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import * as M from ${literal(at.module)};
import { drawingsFrom, puppetFrom } from ${literal(`${FILM}puppet/load.ts`)};
import { PuppetImagesBrowser } from ${literal(`${FILM}puppet/images-browser.ts`)};
import { drawPuppet } from ${literal(`${FILM}canvas/puppet.ts`)};
import { puppetGl } from ${literal(`${FILM}canvas/puppet-gl.ts`)};

const table = M[${literal(at.name)}];
const spec = ${Option.match(Option.fromUndefinedOr(at.key), { onNone: () => 'table', onSome: (k) => `table[${literal(k)}]` })};
const base64Of = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
try {
  const images = PuppetImagesBrowser.pipe(Layer.provide(FetchHttpClient.layer));
  const puppet = await Effect.runPromise(puppetFrom(spec).pipe(Effect.provide(images)));
  const drawings = await Effect.runPromise(drawingsFrom(spec).pipe(Effect.provide(images)));
  const loaded = { puppet, drawings, paints: true, gl: puppetGl(puppet) };
  const [W, H] = spec.size;
  const sheet = document.createElement('canvas');
  sheet.width = W;
  sheet.height = H;
  const ctx = sheet.getContext('2d', { willReadFrequently: true });
  const frame = document.createElement('canvas');
  frame.width = 1920;
  frame.height = 1080;
  const fctx = frame.getContext('2d', { willReadFrequently: true });
  const draw = (c, pose, look) => {
    const why = drawPuppet(c, spec, loaded, pose, look ?? undefined);
    if (why !== undefined) throw new Error(why);
  };
  window.probe = {
    size: [W, H],
    renderer: (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      return gl ? String(gl.getParameter(gl.RENDERER)) : 'none';
    })(),
    draw: (pose, look) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // the puppet's origin where it stands in its sheet, so the canvas is the sheet's frame
      ctx.translate(spec.origin[0], spec.origin[1]);
      draw(ctx, pose, look);
      return base64Of(new Uint8Array(ctx.getImageData(0, 0, W, H).data.buffer));
    },
    time: (poses, look) =>
      poses.map((pose) => {
        const t0 = performance.now();
        fctx.setTransform(1, 0, 0, 1, 0, 0);
        fctx.fillStyle = '#f2eada';
        fctx.fillRect(0, 0, 1920, 1080);
        fctx.translate(Math.floor((1920 - W) / 2), Math.floor((1080 - H) / 2));
        draw(fctx, pose, look);
        fctx.getImageData(0, 0, 1, 1);
        return performance.now() - t0;
      }),
  };
  window.ready = true;
} catch (e) {
  window.loadError = String(e && e.stack ? e.stack : e);
}
`;

/** The page's one HTML file: the built entry. */
const INDEX =
  '<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="/entry.js"></script></body></html>';

/** Waits in the page for its load: `ready`, or why not. */
const LOADED = `new Promise((done) => { const t0 = Date.now(); const look = () => window.ready ? done('ready') : window.loadError ? done('error: ' + window.loadError) : Date.now() - t0 > 60000 ? done('timeout') : setTimeout(look, 20); look(); })`;

/** The built page's files on loopback: a file asked for that is not there answers 404. */
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

/** The page of the puppet `at` declares, open for the scope. */
export const puppetPage = Effect.fn('test.puppetPage')(function* (at: PuppetAt) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const cache = path.join(FILM, '..', 'node_modules', '.cache', 'puppet-page');
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
  if (state !== 'ready') return yield* Effect.die(new Error(`puppet page: ${state}`));
  const [width, height] = yield* Effect.promise(() =>
    view.evaluate<[number, number]>('window.probe.size'),
  );
  const renderer = yield* Effect.promise(() => view.evaluate<string>('window.probe.renderer'));
  const page: PuppetPage = {
    renderer,
    draw: (pose, look) =>
      Effect.promise(() =>
        view.evaluate<string>(`window.probe.draw(${literal(pose)}, ${lookOf(look)})`),
      ).pipe(
        Effect.map((b64): Raster => ({
          width,
          height,
          rgba: Uint8Array.from(Buffer.from(b64, 'base64')),
        })),
      ),
    time: (poses, look) =>
      Effect.promise(() =>
        view.evaluate<number[]>(`window.probe.time(${literal(poses)}, ${lookOf(look)})`),
      ),
  };
  return page;
});
