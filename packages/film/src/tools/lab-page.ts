import {
  Array as Arr,
  Clock,
  Context,
  Deferred,
  Duration,
  Effect,
  Equal,
  Fiber,
  FileSystem,
  Hash,
  Layer,
  Option,
  Order,
  Path,
  Predicate,
  Random,
  Record,
  Ref,
  Result,
  Schema,
  Semaphore,
  Stream,
  SubscriptionRef,
} from 'effect';
import type { BunPlugin } from 'bun';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { type AppPage, labUrls, pageAt } from '../core/api.ts';
import { LONGEST_WAIT } from '../core/wait.ts';
import type { PageBuild } from '../core/schema.ts';
import { PAGE_CUT_MARK, type PageAsked } from '../core/page-render.ts';
import { appleAgent } from '../browser/keys.ts';
import { brotliCompress, constants as zlib } from 'node:zlib';
import { type PageAnswer, PageReads, pageCodingOf } from './api-server.ts';
import {
  PageRenderer,
  type RenderBuild,
  type RenderedPage,
  type ServerBundle,
} from './page-render.ts';
import { type FootageRoot, footageResponse, isFootageUrl } from './footage-route.ts';
import { isNarrationUrl, narrationPath } from './narration-route.ts';
import { narrationUrls } from '../player/narrated.ts';
import { CACHE, serveFile } from './review-file.ts';

export interface LabPageSpec {
  readonly pages: Readonly<Record<AppPage, string>>;
  readonly servers: Partial<Readonly<Record<AppPage, string>>>;
  readonly films: string;
  readonly footage: FootageRoot;
}

interface BuiltFile {
  readonly bytes: Uint8Array;
  readonly type: string;
}

interface AssetFile extends BuiltFile {
  readonly best: Option.Option<Deferred.Deferred<Uint8Array>>;
}

const BEST_BR = 11;

const SQUEEZE_FROM = 1024;

const squeezable = (file: BuiltFile): boolean =>
  file.bytes.byteLength >= SQUEEZE_FROM && file.type.startsWith('text/');

const brotliBest = (bytes: Uint8Array) =>
  Effect.callback<Uint8Array, Error>((resume) => {
    brotliCompress(
      bytes,
      {
        params: {
          [zlib.BROTLI_PARAM_QUALITY]: BEST_BR,
          [zlib.BROTLI_PARAM_SIZE_HINT]: bytes.byteLength,
        },
      },
      (error, out) =>
        resume(
          Option.match(Option.fromNullishOr(error), {
            onNone: () => Effect.succeed(new Uint8Array(out)),
            onSome: Effect.fail,
          }),
        ),
    );
  });

type BuiltAt = BuiltFile & { readonly path: string };

interface Bundled {
  readonly outputs: ReadonlyArray<BuiltAt>;
  readonly server: ReadonlyArray<BuiltAt>;
  readonly inputs: ReadonlyArray<string>;
  readonly serverInputs: ReadonlyArray<string>;
}

const filmCode = (
  path: Path.Path,
  files: ReadonlyArray<string>,
  films: string,
  framework: string,
): ReadonlyArray<string> => {
  const stills = path.join(framework, 'player', 'stills.ts');
  return files.filter(
    (file) =>
      file.startsWith(`${films}${path.sep}`) ||
      file === stills ||
      (file.split(path.sep).includes('scenes') && !file.startsWith(`${framework}${path.sep}`)),
  );
};

const FRAMEWORK = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

interface BundleFailed {
  readonly reason: string;
  readonly files: ReadonlyArray<string>;
}

interface BundleHow {
  readonly publicPath: string;
  readonly swaps: ReadonlyMap<string, string>;
  readonly servers: ReadonlyArray<string>;
}

interface PageBundlerService {
  readonly bundle: (
    entries: ReadonlyArray<string>,
    root: string,
    how: BundleHow,
  ) => Effect.Effect<Bundled, BundleFailed>;
}

const bundlerWords = (cause: unknown): string => {
  if (Predicate.hasProperty(cause, 'errors') && Array.isArray(cause.errors))
    return cause.errors.map(String).join('\n');
  return String(cause);
};

const BundlerMessages = Schema.Struct({
  errors: Schema.Array(
    Schema.Struct({ position: Schema.NullOr(Schema.Struct({ file: Schema.String })) }),
  ),
});

const bundlerFiles = (cause: unknown): ReadonlyArray<string> =>
  Option.match(Schema.decodeUnknownOption(BundlerMessages)(cause), {
    onNone: () => [],
    onSome: ({ errors }) =>
      errors.flatMap(({ position }) =>
        Option.toArray(Option.filter(Option.fromNullOr(position), (at) => at.file.length > 0)).map(
          (at) => at.file,
        ),
      ),
  });

const literally = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const swapPlugin = (swaps: ReadonlyMap<string, string>, read: Set<string>): BunPlugin => ({
  name: 'film-wedge',
  setup(build) {
    const exact = new RegExp(`^(?:${[...swaps.keys()].map(literally).join('|')})$`);
    build.onLoad({ filter: exact }, (args) => {
      read.add(args.path);
      return {
        contents: Option.getOrElse(Option.fromUndefinedOr(swaps.get(args.path)), () => ''),
        loader: 'ts',
      };
    });
  },
});

const bunBuild = (path: Path.Path, config: Bun.BuildConfig) =>
  Effect.gen(function* () {
    const out = yield* Effect.tryPromise({
      try: () => Bun.build({ ...config, metafile: true, throw: true }),
      catch: (cause): BundleFailed => ({
        reason: bundlerWords(cause),
        files: bundlerFiles(cause).map((file) => path.resolve(file)),
      }),
    });
    const outputs = yield* Effect.forEach(out.outputs, (file) =>
      Effect.map(
        Effect.promise(() => file.arrayBuffer()),
        (buffer): BuiltAt => ({
          path: file.path.replace(/^\.\//, ''),
          bytes: new Uint8Array(buffer),
          type: file.type,
        }),
      ),
    );
    const inputs = Object.keys(out.metafile?.inputs ?? {}).map((input) => path.resolve(input));
    return { outputs, inputs };
  });

const bunBundle =
  (path: Path.Path) => (entries: ReadonlyArray<string>, root: string, how: BundleHow) =>
    Effect.gen(function* () {
      const { solidPluginFor } = yield* Effect.promise(() => import('./solid-plugin.ts'));
      const swapped = new Set<string>();
      const swaps = Arr.filter([swapPlugin(how.swaps, swapped)], () => how.swaps.size > 0);
      const [browser, server] = yield* Effect.all(
        [
          bunBuild(path, {
            entrypoints: [...entries],
            root,
            publicPath: how.publicPath,
            plugins: [...swaps, solidPluginFor('dom')],
            target: 'browser',
            conditions: ['development'],
            splitting: true,
            minify: true,
            sourcemap: 'linked',
          }),
          Effect.suspend(() => {
            if (how.servers.length === 0) return Effect.succeed({ outputs: [], inputs: [] });
            return bunBuild(path, {
              entrypoints: [...how.servers],
              root,
              plugins: [solidPluginFor('ssr')],
              target: 'bun',
              splitting: true,
            });
          }),
        ],
        { concurrency: 2 },
      );
      const unread = [...how.swaps.keys()].filter((file) => !swapped.has(file));
      if (unread.length > 0)
        return yield* Effect.fail<BundleFailed>({
          reason: `the build read none of ${unread.join(', ')}, so it cannot draw them changed`,
          files: unread,
        });
      return {
        outputs: browser.outputs,
        server: server.outputs,
        inputs: Arr.dedupe([...browser.inputs, ...server.inputs]),
        serverInputs: server.inputs,
      } satisfies Bundled;
    });

const pinPackages = (path: Path.Path): BunPlugin => ({
  name: 'film-pin-packages',
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path.includes(':')) return { path: args.path, external: true };
      return { path: Bun.resolveSync(args.path, path.dirname(args.importer)), external: true };
    });
  },
});

export const bunModule = (
  path: Path.Path,
  file: string,
  swaps: ReadonlyMap<string, string>,
  into: string,
) =>
  Effect.gen(function* () {
    const read = new Set<string>();
    const built = yield* bunBuild(path, {
      entrypoints: [file],
      target: 'bun',
      publicPath: `${into}${path.sep}`,
      plugins: [pinPackages(path), swapPlugin(swaps, read)],
    });
    const unread = [...swaps.keys()].filter((swapped) => !read.has(swapped));
    if (unread.length > 0)
      return yield* Effect.fail<BundleFailed>({
        reason: `the build read none of ${unread.join(', ')}, so it cannot draw them changed`,
        files: unread,
      });
    return built.outputs;
  });

const typeOf = (file: string): string => {
  if (file.endsWith('.html')) return 'text/html;charset=utf-8';
  return 'text/javascript';
};

export class PageBundler extends Context.Service<PageBundler, PageBundlerService>()(
  '@manna/film/tools/PageBundler',
) {
  static readonly layer = Layer.effect(
    PageBundler,
    Effect.map(Path.Path, (path) => PageBundler.of({ bundle: bunBundle(path) })),
  );

  static readonly layerTest = Layer.effect(
    PageBundler,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const asWritten = (files: ReadonlyArray<string>, root: string, how: BundleHow) =>
        Effect.forEach(files, (file) =>
          Effect.map(
            Option.match(Option.fromUndefinedOr(how.swaps.get(file)), {
              onNone: () => fs.readFile(file),
              onSome: (text) => Effect.succeed(new TextEncoder().encode(text)),
            }),
            (bytes): BuiltAt => ({
              path: path.relative(root, file),
              bytes,
              type: typeOf(file),
            }),
          ),
        );
      return PageBundler.of({
        bundle: (entries, root, how) =>
          Effect.all({
            outputs: asWritten(entries, root, how),
            server: asWritten(how.servers, root, how),
          }).pipe(
            Effect.map(({ outputs, server }) => ({
              outputs,
              server,
              inputs: [...entries, ...how.servers],
              serverInputs: how.servers,
            })),
            Effect.mapError((error): BundleFailed => ({ reason: error.message, files: [] })),
          ),
      });
    }),
  );
}

interface Built {
  readonly build: number;
  readonly kept: number;
  readonly started: number;
  readonly fresh: Freshness;
  readonly prints: ReadonlyMap<string, string>;
  readonly outcome:
    | {
        readonly _tag: 'Built';
        readonly pages: ReadonlyMap<AppPage, BuiltFile>;
        readonly files: ReadonlyMap<string, AssetFile>;
        readonly server: ServerBundle;
      }
    | { readonly _tag: 'Failed'; readonly reason: string };
}

type Freshness = 'Steady' | 'Moved' | 'Unsure';

const printOf = (bytes: Uint8Array): string => `${bytes.length}:${Bun.hash(bytes).toString(36)}`;

const GONE = 'gone';

const BUILD_TRIES = 3;

const KEPT = 3;
const SETTLE = Duration.millis(150);
const ARMING = Duration.millis(250);
const MTIME_LAG = Duration.seconds(1);
const RETRY = Duration.millis(500);
const COUNTED_KEPT = 8;

interface Served {
  readonly since: number;
  readonly server: Option.Option<string>;
  readonly film: Option.Option<string>;
}

interface Changes {
  readonly n: number;
  readonly all: number;
  readonly mixed: ReadonlyMap<string, number>;
}

const forAll = (seen: Changes): Changes => ({ ...seen, n: seen.n + 1, all: seen.n + 1 });

const mixOf =
  (film: string) =>
  (seen: Changes): Changes => ({
    ...seen,
    n: seen.n + 1,
    mixed: new Map([...seen.mixed, [film, seen.n + 1]]),
  });

const heardBy =
  (film: Option.Option<string>) =>
  (seen: Changes): number =>
    Math.max(
      seen.all,
      Option.getOrElse(
        Option.flatMap(film, (name) => Option.fromUndefinedOr(seen.mixed.get(name))),
        () => 0,
      ),
    );

interface LabPageService {
  readonly answer: PageAnswer;
  readonly wait: (served: Served, timeout: Duration.Input) => Effect.Effect<PageBuild>;
  readonly heardAt: (film: string, at: number) => Effect.Effect<Option.Option<PageBuild>>;
  readonly built: Effect.Effect<PagesNow>;
  readonly wedge: (swaps: ReadonlyMap<string, string>) => Effect.Effect<Wedged>;
}

export interface PagesNow {
  readonly build: PageBuild;
  readonly kept: number;
  readonly failed: Option.Option<string>;
}

interface Wedged extends PagesNow {
  readonly wedge: string;
}

const WEDGE_PATH = '/wedge/';

interface WedgeBuilt {
  readonly id: string;
  readonly pages: ReadonlyMap<AppPage, BuiltFile>;
  readonly files: ReadonlyMap<string, AssetFile>;
}

const STATS_AT_ONCE = 32;

export class LabPage extends Context.Service<LabPage, LabPageService>()(
  '@manna/film/tools/LabPage',
) {
  static layer(
    spec: LabPageSpec,
  ): Layer.Layer<LabPage, never, FileSystem.FileSystem | Path.Path | PageBundler | PageRenderer> {
    return Layer.effect(LabPage, make(spec));
  }
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );

const stamped = (html: string, build: PageBuild) =>
  html.replace(
    '</head>',
    `<meta name="lab-build" content="${build.build}" /><meta name="lab-server" content="${escapeHtml(build.server)}" /></head>`,
  );

const BODY_OPEN = /<body\b([^>]*)>/i;

const bodyWith = (attributes: string, extra: string): string => {
  const classed = /\bclass="([^"]*)"/.exec(attributes);
  if (Predicate.isNull(classed)) return `<body${attributes} class="${escapeHtml(extra)}">`;
  return `<body${attributes.replace(classed[0], `class="${classed[1]} ${escapeHtml(extra)}"`)}>`;
};

export const splice = (
  html: string,
  page: Pick<RenderedPage, 'head' | 'bodyClass'>,
): Option.Option<readonly [string, string]> => {
  const headEnd = html.indexOf('</head>');
  if (headEnd < 0) return Option.none();
  const rest = html.slice(headEnd);
  return Option.map(Option.fromNullishOr(BODY_OPEN.exec(rest)), (open) => {
    const tag = bodyWith(open[1] ?? '', page.bodyClass);
    const before = `${html.slice(0, headEnd)}${page.head}${rest.slice(0, open.index)}${tag}`;
    return [before, rest.slice(open.index + open[0].length)] as const;
  });
};

const urlOf = (request: HttpServerRequest.HttpServerRequest): string => {
  const host = Option.getOrElse(Option.fromUndefinedOr(request.headers['host']), () => 'lab');
  return new URL(request.url, `http://${host}`).href;
};

const askedOf = (request: HttpServerRequest.HttpServerRequest): PageAsked => ({
  url: urlOf(request),
  mac: appleAgent(
    Option.getOrElse(Option.fromUndefinedOr(request.headers['user-agent']), () => ''),
  ),
});

const jsonText = Schema.encodeSync(Schema.fromJsonString(Schema.String));

const FAILED_PAUSE_MS = 2000;

const TOKENS_FILE = `${import.meta.dir}/../player/tokens.css`;

const failedStyle = (tokens: string) =>
  `${tokens}` +
  'body{margin:0;padding:var(--s-6);background:var(--surface-0);color:var(--text-1);' +
  'font-family:var(--font);font-size:var(--fs-3);line-height:var(--lh-3)}' +
  'h1{font-size:var(--fs-5);line-height:var(--lh-5);font-weight:var(--w-3)}pre{white-space:pre-wrap}';

const failedPage = (reason: string, build: PageBuild, tokens: string) =>
  stamped(
    `<!doctype html><html><head><meta charset="utf-8" /><title>Lab: the page did not build</title><style>${failedStyle(tokens)}</style></head>`,
    build,
  ) +
  `<body>` +
  `<h1>The lab's page did not build</h1><pre>${escapeHtml(reason)}</pre>` +
  `<script>(async()=>{const S=${jsonText(build.server)},B=${build.build},` +
  `u=${jsonText(labUrls.page.wait({ query: { since: build.build, server: build.server, timeout: LONGEST_WAIT } }))};` +
  `for(;;){try{const r=await fetch(u);if(r.ok){const b=await r.json();if(b.server!==S||b.build>B)return location.reload()}}catch{}` +
  `await new Promise(f=>setTimeout(f,${FAILED_PAUSE_MS}))}})()</script>` +
  `</body></html>`;

const failureOf = (built: Built): Option.Option<string> => {
  if (built.outcome._tag === 'Failed') return Option.some(built.outcome.reason);
  return Option.none();
};

const pagesOf = (built: Built): ReadonlyMap<AppPage, BuiltFile> => {
  if (built.outcome._tag === 'Built') return built.outcome.pages;
  return new Map();
};

const filesOf = (built: Built): ReadonlyMap<string, AssetFile> => {
  if (built.outcome._tag === 'Built') return built.outcome.files;
  return new Map();
};

const commonDir = (dirs: ReadonlyArray<string>): string => {
  const [first = [], ...rest] = dirs.map((dir) => dir.split('/'));
  const common = rest.reduce((shared, parts) => {
    const differs = shared.findIndex((part, i) => part !== parts[i]);
    if (differs === -1) return shared;
    return shared.slice(0, differs);
  }, first);
  return common.join('/') || '/';
};

const NOT_FOUND = HttpServerResponse.text('not found', { status: 404 });
const HTML = 'text/html;charset=utf-8';

const serverId = Effect.gen(function* () {
  const started = yield* Clock.currentTimeMillis;
  const draw = yield* Random.nextIntBetween(0, 36 ** 4);
  return `${started.toString(36)}-${draw.toString(36)}`;
});

const realSpec = (fs: FileSystem.FileSystem, path: Path.Path, spec: LabPageSpec) => {
  const real = (file: string) =>
    fs.realPath(file).pipe(Effect.orElseSucceed(() => path.resolve(file)));
  return Effect.map(
    Effect.all({
      pages: Effect.all(Record.map(spec.pages, real)),
      servers: Effect.map(
        Effect.forEach(
          Record.keys(spec.pages).flatMap((page) =>
            Option.toArray(Option.fromUndefinedOr(spec.servers[page])).map(
              (entry) => [page, entry] as const,
            ),
          ),
          ([page, entry]) => Effect.map(real(entry), (file) => [page, file] as const),
        ),
        (pairs): LabPageSpec['servers'] => Record.fromEntries(pairs),
      ),
      films: real(spec.films),
    }),
    (named): LabPageSpec => ({ ...spec, ...named }),
  );
};

const make = Effect.fnUntraced(function* (given: LabPageSpec) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spec = yield* realSpec(fs, path, given);
  const bundler = yield* PageBundler;
  const renderer = yield* PageRenderer;
  const scope = yield* Effect.scope;
  const server = yield* serverId;
  const tokens = yield* fs.readFileString(TOKENS_FILE).pipe(Effect.orElseSucceed(() => ''));
  const changes = yield* SubscriptionRef.make<Changes>({ n: 0, all: 0, mixed: new Map() });
  const sourced = yield* Ref.make(0);
  const read = yield* Ref.make(Option.none<ReadonlySet<string>>());
  const masters = yield* Ref.make<ReadonlyMap<string, Option.Option<number>>>(new Map());
  const counted = yield* Ref.make<ReadonlyMap<string, ReadonlyArray<readonly [number, number]>>>(
    new Map(),
  );
  const landing = yield* Semaphore.make(1);
  const films = path.resolve(spec.films);
  const watchers = yield* Ref.make<ReadonlyMap<string, Fiber.Fiber<void>>>(new Map());
  const watching = yield* Semaphore.make(1);
  const asked = yield* Ref.make<ReadonlyArray<string>>([]);
  const builds = yield* Ref.make<ReadonlyArray<Built>>([]);
  const building = yield* Semaphore.make(1);
  const wedges = yield* Ref.make<ReadonlyArray<WedgeBuilt>>([]);
  const wedging = yield* Semaphore.make(1);
  const retrying = yield* Semaphore.make(1);
  const entries = Record.toEntries(spec.pages);
  const htmls = entries.map(([, html]) => path.resolve(html));
  const servers = entries.flatMap(([page]) =>
    Option.toArray(
      Option.map(
        Option.fromUndefinedOr(spec.servers[page]),
        (e) => [page, path.resolve(e)] as const,
      ),
    ),
  );
  const serverEntries = servers.map(([, entry]) => entry);
  const root = commonDir([...htmls, ...serverEntries].map(path.dirname));
  const pageOf = new Map(entries.map(([page, html]) => [path.relative(root, html), page]));
  const serverModules = new Map(
    servers.map(([page, entry]) => [
      page,
      path.relative(root, entry).replace(/\.[cm]?tsx?$/, '.js'),
    ]),
  );
  const asWritten: BundleHow = { publicPath: '/', swaps: new Map(), servers: serverEntries };

  const foldersOf = (files: ReadonlyArray<string>) =>
    Arr.sort(
      Arr.dedupe(files.filter((file) => !file.includes('/node_modules/')).map(path.dirname)),
      Order.String,
    );

  const sourceChanged = Effect.flatMap(SubscriptionRef.updateAndGet(changes, forAll), (seen) =>
    Ref.set(sourced, seen.n),
  );

  const mtimeOf = (file: string) =>
    fs.stat(file).pipe(
      Effect.map((info) => Option.map(info.mtime, (at) => at.getTime())),
      Effect.orElseSucceed(() => Option.none<number>()),
    );

  const printNow = (file: string) =>
    fs.readFile(file).pipe(
      Effect.map(printOf),
      Effect.orElseSucceed(() => GONE),
    );

  const printsOf = (files: Iterable<string>) =>
    Effect.map(
      Effect.forEach(
        [...files].filter((file) => !file.includes('/node_modules/')),
        (file) => Effect.map(printNow(file), (print) => [file, print] as const),
        { concurrency: STATS_AT_ONCE },
      ),
      (pairs): ReadonlyMap<string, string> => new Map(pairs),
    );

  const unmoved = (file: string) =>
    Effect.gen(function* () {
      const newest = Arr.head(yield* Ref.get(builds));
      if (Option.isNone(newest) || newest.value.fresh !== 'Steady') return false;
      const print = Option.fromUndefinedOr(newest.value.prints.get(file));
      if (Option.isNone(print)) return false;
      return (yield* printNow(file)) === print.value;
    });

  const filmOf = (master: string) => path.basename(path.dirname(path.dirname(master)));

  const landed = (master: string) =>
    landing.withPermit(
      Effect.uninterruptible(
        Effect.gen(function* () {
          const at = yield* mtimeOf(master);
          if (Option.isNone(at)) return;
          const fresh = yield* Ref.modify(
            masters,
            (known): readonly [boolean, ReadonlyMap<string, Option.Option<number>>] => {
              const last = Option.fromUndefinedOr(known.get(master));
              if (Option.isNone(last) || Equal.equals(last.value, at)) return [false, known];
              return [true, new Map([...known, [master, at]])];
            },
          );
          if (!fresh) return;
          const seen = yield* SubscriptionRef.updateAndGet(changes, mixOf(filmOf(master)));
          yield* Ref.update(counted, (kept) => {
            const before = Option.getOrElse(Option.fromUndefinedOr(kept.get(master)), () => []);
            const next = [...before, [at.value, seen.n] as const].slice(-COUNTED_KEPT);
            return new Map([...kept, [master, next]]);
          });
        }),
      ),
    );

  const heardAt = (film: string, at: number): Effect.Effect<Option.Option<PageBuild>> =>
    Effect.gen(function* () {
      const master = Arr.findFirst(
        [...(yield* Ref.get(masters)).keys()],
        (m) => filmOf(m) === film,
      );
      if (Option.isNone(master)) return Option.none();
      yield* landed(master.value);
      const kept = Option.getOrElse(
        Option.fromUndefinedOr((yield* Ref.get(counted)).get(master.value)),
        () => [],
      );
      return Option.map(
        Arr.findFirst(kept, ([mtime]) => mtime === at),
        ([, n]) => ({ build: n, server }),
      );
    });

  const landedUnwatched = (tracks: ReadonlyArray<string>) =>
    Effect.andThen(Effect.sleep(ARMING), Effect.forEach(tracks, landed, { discard: true })).pipe(
      Effect.forkIn(scope),
    );

  const heard = (file: string): Effect.Effect<void> =>
    Effect.gen(function* () {
      const inputs = yield* Ref.get(read);
      if (Option.match(inputs, { onNone: () => true, onSome: (set) => set.has(file) })) {
        return yield* building.withPermit(
          Effect.flatMap(unmoved(file), (held) => {
            if (held) return Effect.void;
            return sourceChanged;
          }),
        );
      }
      const tracks = [...(yield* Ref.get(masters)).keys()];
      if (tracks.includes(file)) return yield* landed(file);
      const below = tracks.filter((track) => track.startsWith(`${file}/`));
      if (below.length === 0) return;
      yield* Effect.forkIn(
        Effect.andThen(rewatchAfter(Effect.void), landedUnwatched(below)),
        scope,
      );
    });
  const watch = (dir: string) =>
    fs.watch(dir).pipe(
      Stream.map((event) => path.resolve(dir, event.path)),
      Stream.catch((error) =>
        Stream.fromEffect(
          Effect.logWarning(`lab.page.watch.failed dir=${dir} ${error.message}`),
        ).pipe(Stream.drain),
      ),
      Stream.runForEach(heard),
    );

  const nearest = (dir: string): Effect.Effect<string> =>
    Effect.flatMap(
      fs.exists(dir).pipe(Effect.orElseSucceed(() => false)),
      (there): Effect.Effect<string> => {
        if (there || !dir.startsWith(`${films}/`)) return Effect.succeed(dir);
        return nearest(path.dirname(dir));
      },
    );

  const rewatch: Effect.Effect<ReadonlyArray<string>> = Effect.gen(function* () {
    const tracks = yield* Effect.forEach((yield* Ref.get(masters)).keys(), (track) =>
      nearest(path.dirname(track)),
    );
    const wanted = Arr.dedupe([...(yield* Ref.get(asked)), ...tracks]);
    const was = yield* Ref.get(watchers);
    const next = new Map<string, Fiber.Fiber<void>>();
    for (const [dir, fiber] of was) {
      if (wanted.includes(dir)) next.set(dir, fiber);
      else yield* Fiber.interrupt(fiber);
    }
    const added = wanted.filter((dir) => !was.has(dir));
    for (const dir of added) next.set(dir, yield* Effect.forkIn(watch(dir), scope));
    yield* Ref.set(watchers, next);
    return added;
  });

  const rewatchAfter = (change: Effect.Effect<void>) =>
    watching.withPermit(Effect.uninterruptible(Effect.andThen(change, rewatch)));

  const watchOnly = (dirs: ReadonlyArray<string>) => rewatchAfter(Ref.set(asked, dirs));

  const trackAsked = (pathname: string, file: string) =>
    Effect.gen(function* () {
      const master = path.resolve(file);
      if (pathname !== narrationUrls(filmOf(master)).audio) return;
      if ((yield* Ref.get(masters)).has(master)) return;
      const at = yield* mtimeOf(master);
      yield* Effect.uninterruptible(
        Effect.andThen(
          rewatchAfter(Ref.update(masters, (known) => new Map([...known, [master, at]]))),
          landedUnwatched([master]),
        ),
      );
    });

  const missed = (suspects: ReadonlyArray<string>, started: number) =>
    Effect.gen(function* () {
      if (suspects.length === 0) return;
      yield* Effect.sleep(ARMING);
      const since = started - Duration.toMillis(MTIME_LAG);
      const changed = yield* building.withPermit(
        Effect.forEach(suspects, (file) =>
          Effect.gen(function* () {
            if (Option.exists(yield* Ref.get(read), (set) => !set.has(file))) return false;
            if (yield* unmoved(file)) return false;
            return yield* fs.stat(file).pipe(
              Effect.map((info) => Option.exists(info.mtime, (at) => at.getTime() >= since)),
              Effect.orElseSucceed(() => true),
            );
          }),
        ),
      );
      if (!changed.includes(true)) return;
      yield* Effect.log(`lab.page.watch.missed files=${suspects.length}`);
      yield* sourceChanged;
    }).pipe(Effect.forkIn(scope));

  yield* watchOnly(foldersOf([...htmls, ...serverEntries]));

  const freshness = (
    before: ReadonlyMap<string, string>,
    after: ReadonlyMap<string, string>,
  ): Freshness => {
    const files = [...after].map(([file, print]) => ({
      print,
      was: Option.fromUndefinedOr(before.get(file)),
    }));
    if (files.some((f) => Option.exists(f.was, (was) => was !== f.print))) return 'Moved';
    if (files.some((f) => Option.isNone(f.was))) return 'Unsure';
    return 'Steady';
  };

  const assetsOf = Effect.fnUntraced(function* (made: ReadonlyArray<readonly [string, BuiltFile]>) {
    const kept = new Map((yield* Ref.get(builds)).flatMap((b) => [...filesOf(b)]));
    const files = new Map<string, AssetFile>();
    const fresh: Array<readonly [string, Uint8Array, Deferred.Deferred<Uint8Array>]> = [];
    for (const [at, file] of made) {
      const shared = Option.flatMap(Option.fromUndefinedOr(kept.get(at)), (k) => k.best);
      if (Option.isSome(shared) || !squeezable(file)) {
        files.set(at, { ...file, best: shared });
        continue;
      }
      const best = yield* Deferred.make<Uint8Array>();
      fresh.push([at, file.bytes, best]);
      files.set(at, { ...file, best: Option.some(best) });
    }
    if (fresh.length > 0) yield* Effect.forkIn(squeeze(fresh), scope);
    return files;
  });

  const squeeze = (
    fresh: ReadonlyArray<readonly [string, Uint8Array, Deferred.Deferred<Uint8Array>]>,
  ) =>
    Effect.gen(function* () {
      const started = yield* Clock.currentTimeMillis;
      const sizes = yield* Effect.forEach(fresh, ([at, bytes, best]) =>
        brotliBest(bytes).pipe(
          Effect.tap((out) => Deferred.succeed(best, out)),
          Effect.map((out) => out.byteLength),
          Effect.catch((error) =>
            Effect.as(
              Effect.logWarning(`lab.page.squeeze.failed path=${at} reason="${error.message}"`),
              bytes.byteLength,
            ),
          ),
        ),
      );
      const ms = (yield* Clock.currentTimeMillis) - started;
      const raw = Arr.reduce(fresh, 0, (sum, [, bytes]) => sum + bytes.byteLength);
      yield* Effect.log(
        `lab.page.squeezed files=${fresh.length} raw=${raw} br=${Arr.reduce(sizes, 0, (a, b) => a + b)} ms=${ms}`,
      );
    });

  const bundle = Effect.fnUntraced(function* (build: number) {
    const started = yield* Clock.currentTimeMillis;
    const printedBefore = yield* Option.match(yield* Ref.get(read), {
      onNone: () => Effect.succeed<ReadonlyMap<string, string>>(new Map()),
      onSome: printsOf,
    });
    const printed = yield* Ref.make<{ fresh: Freshness; prints: ReadonlyMap<string, string> }>({
      fresh: 'Unsure',
      prints: new Map(),
    });
    const outcome = yield* bundler.bundle(htmls, root, asWritten).pipe(
      Effect.flatMap(({ outputs, server, inputs, serverInputs }) =>
        Effect.gen(function* () {
          const drawn = filmCode(path, serverInputs, films, FRAMEWORK);
          if (drawn.length > 0)
            return yield* Effect.fail<BundleFailed>({
              reason: `a page's server render draws no film, but its server entry reads ${drawn.join(', ')}: give the page the film from its browser entry (clientOnly)`,
              files: drawn,
            });
          const after = yield* printsOf(inputs);
          yield* Ref.set(printed, { fresh: freshness(printedBefore, after), prints: after });
          const before = yield* Ref.getAndSet(read, Option.some(new Set(inputs)));
          const added = yield* watchOnly(foldersOf([...htmls, ...serverEntries, ...inputs]));
          yield* missed(
            inputs.filter(
              (input) =>
                !input.includes('/node_modules/') &&
                (added.includes(path.dirname(input)) ||
                  Option.exists(before, (set) => !set.has(input))),
            ),
            started,
          );
          const pages = new Map<AppPage, BuiltFile>();
          const made: Array<readonly [string, BuiltFile]> = [];
          for (const { path: name, ...built } of outputs)
            Option.match(Option.fromUndefinedOr(pageOf.get(name)), {
              onNone: () => made.push([`/${name}`, built]),
              onSome: (page) => pages.set(page, built),
            });
          return {
            _tag: 'Built',
            pages,
            files: yield* assetsOf(made),
            server: { files: server, entries: serverModules },
          } as const;
        }),
      ),
      Effect.catch((failed) =>
        Effect.gen(function* () {
          yield* Ref.set(read, Option.none());
          const kept = yield* Ref.get(asked);
          const added = yield* watchOnly(
            Arr.sort(Arr.dedupe([...kept, ...foldersOf(failed.files)]), Order.String),
          );
          yield* missed(
            failed.files.filter((file) => added.includes(path.dirname(file))),
            started,
          );
          return { _tag: 'Failed', reason: failed.reason } as const;
        }),
      ),
    );
    const { fresh, prints } = yield* Ref.get(printed);
    yield* Effect.log(
      `lab.page.build build=${build} outcome=${outcome._tag} fresh=${fresh} files=${prints.size}`,
    );
    return { build, kept: build, started, fresh, prints, outcome } satisfies Built;
  });

  const currentHeld = Effect.uninterruptible(
    Effect.gen(function* () {
      const now = (yield* SubscriptionRef.get(changes)).n;
      const since = yield* Ref.get(sourced);
      const last = Arr.head(yield* Ref.get(builds)).pipe(Option.filter((b) => b.build >= since));
      if (
        Option.isSome(last) &&
        last.value.outcome._tag === 'Built' &&
        last.value.fresh !== 'Moved'
      )
        return { ...last.value, build: now };
      let made = yield* bundle(now);
      if (Option.isSome(last) && made.outcome._tag === 'Built') {
        const n = (yield* SubscriptionRef.updateAndGet(changes, forAll)).n;
        made = { ...made, build: n, kept: n };
      }
      yield* Ref.update(builds, (kept) => [made, ...kept].slice(0, KEPT));
      if (made.fresh === 'Moved') {
        yield* Effect.log(`lab.page.build.moved build=${made.build}`);
        yield* sourceChanged;
      }
      return made;
    }),
  );
  const current = building.withPermit(currentHeld);

  const now = (film: Option.Option<string>) =>
    Effect.map(SubscriptionRef.get(changes), (seen) => ({ build: heardBy(film)(seen), server }));

  const retryFailed = retrying.withPermit(
    Effect.forever(
      Effect.gen(function* () {
        yield* Effect.sleep(RETRY);
        const last = Arr.head(yield* Ref.get(builds));
        if (Option.exists(last, (built) => built.outcome._tag === 'Failed')) yield* current;
      }),
    ),
  );

  const filmWaited = (film: string): Effect.Effect<void> =>
    Effect.gen(function* () {
      const pathname = narrationUrls(film).audio;
      const file = yield* narrationPath(spec.films, pathname);
      for (const track of Option.toArray(file)) yield* trackAsked(pathname, track);
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );

  const wait = (served: Served, timeout: Duration.Input): Effect.Effect<PageBuild> => {
    if (Option.exists(served.server, (s) => s !== server)) return now(served.film);
    const heardFrom = Effect.forEach(Option.toArray(served.film), filmWaited, { discard: true });
    return Effect.andThen(
      heardFrom,
      Effect.raceFirst(
        SubscriptionRef.changes(changes).pipe(
          Stream.filter((seen) => heardBy(served.film)(seen) > served.since),
          Stream.runHead,
          Effect.andThen(Effect.sleep(SETTLE)),
        ),
        retryFailed,
      ).pipe(Effect.timeoutOption(timeout), Effect.andThen(now(served.film))),
    );
  };

  const rendered = (
    name: AppPage,
    html: string,
    build: RenderBuild,
    asked: PageAsked,
    read: PageReads['Service']['read'],
  ) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const made = yield* Effect.result(renderer.render(build, name, asked, read));
        if (Result.isFailure(made)) {
          yield* Effect.logWarning(
            `lab.page.render.failed page=${name} build=${build.id} reason="${made.failure.reason}"`,
          );
          return Stream.succeed(html);
        }
        return Option.match(splice(html, made.success), {
          onNone: () => Stream.succeed(html),
          onSome: ([before, after]) =>
            Stream.concat(
              Stream.succeed(before),
              Stream.concat(
                made.success.markup.pipe(
                  Stream.catch((error) =>
                    Stream.as(
                      Stream.fromEffect(
                        Effect.logWarning(
                          `lab.page.render.cut page=${name} build=${build.id} reason="${error.reason}"`,
                        ),
                      ),
                      PAGE_CUT_MARK,
                    ),
                  ),
                ),
                Stream.succeed(after),
              ),
            ),
        });
      }),
    );

  const page = (name: AppPage) =>
    Effect.gen(function* () {
      const built = yield* current;
      const stamp = { build: built.build, server };
      if (built.outcome._tag === 'Failed')
        return HttpServerResponse.text(failedPage(built.outcome.reason, stamp, tokens), {
          status: 500,
          contentType: HTML,
          headers: { 'cache-control': CACHE.none },
        });
      const html = Option.fromUndefinedOr(built.outcome.pages.get(name));
      if (Option.isNone(html)) return NOT_FOUND;
      const text = stamped(new TextDecoder().decode(html.value.bytes), stamp);
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (request.method !== 'GET' || !built.outcome.server.entries.has(name))
        return HttpServerResponse.text(text, {
          contentType: HTML,
          headers: { 'cache-control': CACHE.none },
        });
      const { read } = yield* PageReads;
      const build = { id: built.kept, bundle: built.outcome.server };
      const body = rendered(name, text, build, askedOf(request), read);
      return HttpServerResponse.stream(Stream.encodeText(body), {
        contentType: HTML,
        headers: { 'cache-control': CACHE.none },
      });
    });

  const asset = (pathname: string) =>
    Effect.gen(function* () {
      const kept = [
        ...(yield* Ref.get(builds)).map(filesOf),
        ...(yield* Ref.get(wedges)).map((w) => w.files),
      ];
      const found = Arr.findFirst(kept, (files) => Option.fromUndefinedOr(files.get(pathname)));
      if (Option.isNone(found)) return Option.none();
      const { bytes, type, best } = found.value;
      const accept = Option.fromUndefinedOr(
        (yield* HttpServerRequest.HttpServerRequest).headers['accept-encoding'],
      );
      const made = yield* Option.match(
        Option.filter(best, () => Option.contains(pageCodingOf(accept), 'br')),
        {
          onNone: () => Effect.succeedNone,
          onSome: (deferred) =>
            Effect.flatMap(Deferred.isDone(deferred), (done) =>
              Effect.when(Deferred.await(deferred), Effect.succeed(done)),
            ),
        },
      );
      const cache = { 'cache-control': CACHE.hashed };
      return Option.some(
        Option.match(made, {
          onNone: () => HttpServerResponse.uint8Array(bytes, { contentType: type, headers: cache }),
          onSome: (br) =>
            HttpServerResponse.uint8Array(br, {
              contentType: type,
              headers: { ...cache, 'content-encoding': 'br', vary: 'Accept-Encoding' },
            }),
        }),
      );
    });

  const asMade = (html: Option.Option<BuiltFile>) =>
    Option.match(html, {
      onNone: () => NOT_FOUND,
      onSome: (file) =>
        HttpServerResponse.uint8Array(file.bytes, {
          contentType: HTML,
          headers: { 'cache-control': CACHE.none },
        }),
    });

  const wedgePage = (name: AppPage, id: string) =>
    Effect.map(Ref.get(wedges), (kept) =>
      asMade(
        Option.flatMap(
          Arr.findFirst(kept, (w) => w.id === id),
          (w) => Option.fromUndefinedOr(w.pages.get(name)),
        ),
      ),
    );

  const keptPage = (name: AppPage, id: string) =>
    Effect.map(Ref.get(builds), (kept) =>
      asMade(
        Option.flatMap(
          Arr.findFirst(kept, (b) => String(b.kept) === id),
          (b) => Option.fromUndefinedOr(pagesOf(b).get(name)),
        ),
      ),
    );

  const narration = (request: HttpServerRequest.HttpServerRequest, pathname: string) =>
    narrationPath(spec.films, pathname).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeed(NOT_FOUND),
          onSome: (file) =>
            Effect.andThen(
              trackAsked(pathname, file),
              Effect.flatMap(fs.exists(file), (there) => {
                if (there) return serveFile(request, file, CACHE.fresh);
                return Effect.succeed(NOT_FOUND);
              }),
            ),
        }),
      ),
      Effect.catchTags({
        ReviewFileUnknown: () => Effect.succeed(NOT_FOUND),
        PlatformError: (error) =>
          Effect.as(Effect.logWarning(`lab.page.narration.failed ${error.message}`), NOT_FOUND),
      }),
    );

  const answer = Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = new URL(request.url, 'http://lab');
    const pathname = url.pathname;
    if (isNarrationUrl(pathname)) return yield* narration(request, pathname);
    if (isFootageUrl(pathname)) return yield* footageResponse(spec.footage, request, pathname);
    const built = yield* asset(pathname);
    if (Option.isSome(built)) return built.value;
    const wedgeId = Option.fromNullishOr(url.searchParams.get('wedge'));
    const keptId = Option.fromNullishOr(url.searchParams.get('build'));
    return yield* Option.match(pageAt(pathname), {
      onNone: () => Effect.succeed(NOT_FOUND),
      onSome: (name) => {
        if (Option.isSome(wedgeId)) return wedgePage(name, wedgeId.value);
        if (Option.isSome(keptId)) return keptPage(name, keptId.value);
        return page(name);
      },
    });
  });

  const holds = (made: Built) =>
    Effect.gen(function* () {
      if (made.fresh !== 'Steady') return false;
      const now = yield* printsOf(made.prints.keys());
      return [...made.prints].every(([file, print]) => now.get(file) === print);
    });

  const freshHeld = (tries: number): Effect.Effect<Built> =>
    Effect.gen(function* () {
      const made = yield* currentHeld;
      if (made.outcome._tag === 'Failed' || (yield* holds(made))) return made;
      yield* Effect.log(`lab.page.unheard build=${made.kept} fresh=${made.fresh} tries=${tries}`);
      yield* sourceChanged;
      if (tries >= BUILD_TRIES)
        return {
          ...made,
          outcome: {
            _tag: 'Failed',
            reason: `the pages' files moved while each of ${BUILD_TRIES} builds read them: look again once the saves settle`,
          },
        };
      return yield* freshHeld(tries + 1);
    });

  const built = Effect.map(building.withPermit(freshHeld(1)), (made) => ({
    build: { build: made.build, server },
    kept: made.kept,
    failed: failureOf(made),
  })) satisfies Effect.Effect<PagesNow>;

  const swapsKey = (swaps: ReadonlyMap<string, string>) =>
    Arr.sort(
      [...swaps.entries()],
      Order.mapInput(Order.String, ([file]: readonly [string, string]) => file),
    )
      .map(([file, text]) => `${file}\n${text}`)
      .join('\n\0\n');

  const wedge = (swaps: ReadonlyMap<string, string>) =>
    wedging.withPermit(
      Effect.gen(function* () {
        const now = yield* built;
        if (Option.isSome(now.failed)) return { ...now, wedge: '' } satisfies Wedged;
        const id = `${now.build.build}-${(Hash.string(swapsKey(swaps)) >>> 0).toString(36)}`;
        if ((yield* Ref.get(wedges)).some((w) => w.id === id))
          return { ...now, wedge: id } satisfies Wedged;
        const prefix = `${WEDGE_PATH}${id}/`;
        const made = yield* Effect.result(
          bundler.bundle(htmls, root, { publicPath: prefix, swaps, servers: [] }),
        );
        if (Result.isFailure(made)) {
          yield* Effect.log(`lab.page.wedge id=${id} outcome=Failed`);
          return { ...now, failed: Option.some(made.failure.reason), wedge: '' } satisfies Wedged;
        }
        const pages = new Map<AppPage, BuiltFile>();
        const files = new Map<string, AssetFile>();
        for (const { path: name, ...file } of made.success.outputs)
          Option.match(Option.fromUndefinedOr(pageOf.get(name)), {
            onNone: () => files.set(`${prefix}${name}`, { ...file, best: Option.none() }),
            onSome: (page) => pages.set(page, file),
          });
        yield* Ref.update(wedges, (kept) => [{ id, pages, files }, ...kept].slice(0, KEPT));
        yield* Effect.log(`lab.page.wedge id=${id} outcome=Built swaps=${swaps.size}`);
        return { ...now, wedge: id } satisfies Wedged;
      }),
    );

  return LabPage.of({ answer, wait, heardAt, built, wedge });
});
