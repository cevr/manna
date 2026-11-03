import * as BunHttpPlatform from '@effect/platform-bun/BunHttpPlatform';
import * as BunServices from '@effect/platform-bun/BunServices';
import {
  Array as Arr,
  Context,
  type Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  PubSub,
  Record,
  Ref,
  Schedule,
  Stream,
} from 'effect';
import { HttpPlatform, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { LabPage, type LabPageSpec, PageBundler } from '../lab-page.ts';
import { PageReads } from '../api-server.ts';
import { PageRenderer } from '../page-render.ts';
import { memoryFileSystem, text } from '../host/testing.ts';

export const Platform = Layer.provideMerge(BunHttpPlatform.layer, BunServices.layer);

export const html = (title: string, script: string) =>
  `<!doctype html><html><head><title>${title}</title></head><body><script type="module" src="${script}"></script></body></html>`;

export const appFolderWith = (own: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const parent = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
    const making = path.join(parent, 'making');
    for (const folder of ['src/films', 'sub', 'lib', 'extra'])
      yield* fs.makeDirectory(path.join(making, folder), { recursive: true });
    const files = {
      'ask.html': html('ask', './src/p.ts'),
      'sub/index.html': html('render', '../src/render.ts'),
      'src/p.ts': "import { shared } from '../lib/shared.ts';\nconsole.log('first', shared);\n",
      'lib/shared.ts': "export const shared = 'shared one';\n",
      'src/render.ts': "console.log('the render page');\n",
      'src/notes.json': '{}',
      'src/ask.server.tsx':
        "import { shared } from '../lib/shared.ts';\nimport { only } from '../lib/server-only.ts';\nexport const rendered = () => `${shared} ${only}`;\n",
      'lib/server-only.ts': "export const only = 'server one';\n",
      ...own,
    };
    for (const [name, text] of Record.toEntries(files))
      yield* fs.writeFileString(path.join(making, name), text);
    const dir = path.join(parent, 'app');
    yield* fs.rename(making, dir);
    const write = (name: string, text: string) => fs.writeFileString(path.join(dir, name), text);
    const spec = {
      pages: {
        ask: path.join(dir, 'ask.html'),
        render: path.join(dir, 'sub', 'index.html'),
      },
      servers: { ask: path.join(dir, 'src', 'ask.server.tsx') },
      films: path.join(dir, 'src', 'films'),
      footage: { dir: path.join(dir, 'footage'), out: path.join(dir, 'out') },
    };
    return { spec, write };
  });

export const appFolder = appFolderWith({});

const echoReads = PageReads.of({
  read: (path) => Effect.succeed(new Response(`read ${path}`)),
});

export const served = (
  spec: LabPageSpec,
  bundler: Layer.Layer<PageBundler, never, FileSystem.FileSystem | Path.Path>,
  renderer: Layer.Layer<PageRenderer> = PageRenderer.layerTest,
) =>
  Effect.gen(function* () {
    const page = Context.get(
      yield* Layer.build(LabPage.layer(spec).pipe(Layer.provide([bundler, renderer]))),
      LabPage,
    );
    const ask = (pathname: string, method = 'GET', headers: Record<string, string> = {}) =>
      Effect.gen(function* () {
        const request = HttpServerRequest.fromWeb(
          new Request(`http://127.0.0.1:8229${pathname}`, {
            method,
            headers: { host: '127.0.0.1:8229', ...headers },
          }),
        );
        const response = HttpServerResponse.toWeb(
          yield* page.answer.pipe(
            Effect.provideService(HttpServerRequest.HttpServerRequest, request),
            Effect.provideService(PageReads, echoReads),
          ),
        );
        const bytes = new Uint8Array(yield* Effect.promise(() => response.arrayBuffer()));
        return {
          status: response.status,
          location: response.headers.get('location') ?? '',
          type: response.headers.get('content-type') ?? '',
          encoding: response.headers.get('content-encoding') ?? '',
          bytes,
          text: new TextDecoder().decode(bytes),
        };
      });
    return { page, ask };
  });

export const app = Effect.gen(function* () {
  const { spec, write } = yield* appFolder;
  const { page, ask } = yield* served(spec, PageBundler.layer);
  const scriptOf = (pathname: string) =>
    Effect.gen(function* () {
      const text = (yield* ask(pathname)).text;
      const src = /src="\.?(\/[^"]+\.js)"/.exec(text)?.[1] ?? '';
      return (yield* ask(src)).text;
    });
  const script = scriptOf('/asks/a1');
  const waitWriting = (since: number, timeout: Duration.Input, name: string, text: string) =>
    Effect.raceFirst(
      page.wait({ since, server: Option.none(), film: Option.none() }, timeout),
      write(name, text).pipe(
        Effect.repeat(Schedule.spaced('200 millis')),
        Effect.andThen(Effect.never),
      ),
    );
  const waitOnce = (since: number, timeout: Duration.Input, name: string, text: string) =>
    Effect.andThen(
      write(name, text),
      page.wait({ since, server: Option.none(), film: Option.none() }, timeout),
    );
  return { ask, page, script, scriptOf, spec, waitWriting, waitOnce, write };
});

export const buildOf = (text: string) => Number(/name="lab-build" content="(\d+)"/.exec(text)?.[1]);
export const serverOf = (text: string) =>
  /name="lab-server" content="([^"]+)"/.exec(text)?.[1] ?? '';

export const MIXED_AT = 1_900_000_000_000;

export const filmsInMemory = Effect.gen(function* () {
  const html = text('<!doctype html><html><head></head><body></body></html>');
  const files = new Map<string, Uint8Array>([
    ['/app/ask.html', html],
    ['/app/index.html', html],
  ]);
  const mtimes = new Map<string, number>();
  const trackOf = (film: string) => `/app/films/${film}/narration/full.wav`;
  for (const film of ['f', 'g']) {
    files.set(`/app/films/${film}/scenes/index.ts`, text('export {};\n'));
    files.set(trackOf(film), text(`${film} one`));
    mtimes.set(trackOf(film), MIXED_AT);
  }
  const saves = yield* PubSub.unbounded<string>();
  const live = yield* Ref.make<ReadonlyArray<string>>([]);
  const path = yield* Path.Path;
  const fileSystem = Layer.effect(
    FileSystem.FileSystem,
    Effect.map(FileSystem.FileSystem, (fs) =>
      FileSystem.FileSystem.of({
        ...fs,
        watch: (dir) =>
          Stream.unwrap(
            Effect.gen(function* () {
              const told = yield* PubSub.subscribe(saves);
              yield* Ref.update(live, (dirs) => [...dirs, dir]);
              return Stream.fromSubscription(told).pipe(
                Stream.filter((file) => path.dirname(file) === dir),
                Stream.map((file): FileSystem.WatchEvent => ({
                  _tag: 'Update',
                  path: path.basename(file),
                })),
              );
            }),
          ).pipe(Stream.ensuring(Ref.update(live, (dirs) => Arr.remove(dirs, dirs.indexOf(dir))))),
      }),
    ),
  ).pipe(Layer.provide(memoryFileSystem(files, new Set(), mtimes)));
  const memory = yield* Layer.build(
    Layer.provideMerge(HttpPlatform.layer, Layer.mergeAll(fileSystem, Path.layer)),
  );
  const spec = {
    pages: {
      ask: '/app/ask.html',
      render: '/app/index.html',
    },
    servers: {},
    films: '/app/films',
    footage: { dir: '/app/footage', out: '/app/out' },
  };
  const { page, ask } = yield* served(spec, PageBundler.layerTest).pipe(
    Effect.provideContext(memory),
  );
  const land = (film: string, mixed: string) =>
    Effect.sync(() => {
      const at = (mtimes.get(trackOf(film)) ?? MIXED_AT) + 10_000;
      files.set(trackOf(film), text(mixed));
      mtimes.set(trackOf(film), at);
      return at;
    });
  const mix = (film: string, mixed: string) =>
    Effect.tap(land(film, mixed), () => PubSub.publish(saves, trackOf(film)));
  const armed = (film: string) =>
    Ref.get(live).pipe(
      Effect.repeat({
        until: (dirs) => dirs.includes(path.dirname(trackOf(film))),
        schedule: Schedule.spaced('10 millis'),
      }),
      Effect.timeout('2 seconds'),
      Effect.orDie,
      Effect.asVoid,
    );
  return {
    page,
    ask: (pathname: string) => ask(pathname).pipe(Effect.provideContext(memory)),
    land,
    mix,
    armed,
  };
});
