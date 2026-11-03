import * as BunServices from '@effect/platform-bun/BunServices';
import { Array as Arr, Config, Effect, FileSystem, Option, Predicate } from 'effect';
import type { BunPlugin } from 'bun';
import { type PageRender, isPageRender } from '../../core/page-render.ts';
import { solidPlugin, solidPluginFor } from '../../tools/solid-plugin.ts';

const servedFonts: BunPlugin = {
  name: 'served-fonts',
  setup(build) {
    build.onLoad({ filter: /\.woff2$/ }, (args) => ({
      contents: `export default "/${args.path.slice(args.path.lastIndexOf('/') + 1)}";`,
      loader: 'js' as const,
    }));
  },
};

const classicScript: BunPlugin = {
  name: 'classic-script',
  setup(build) {
    build.onLoad({ filter: /effect\/dist\/ConfigProvider\.js$/ }, (args) =>
      Effect.runPromise(
        FileSystem.FileSystem.use((fs) => fs.readFileString(args.path)).pipe(
          Effect.provide(BunServices.layer),
          Effect.map((source) => ({
            contents: source.replaceAll('import.meta?.env', 'undefined'),
            loader: 'js' as const,
          })),
        ),
      ),
    );
  },
};

export const ENTRIES = ['ask-page.ts', 'ask-hydrated-page.ts', 'render-page.ts'];

const DEVELOPMENT: ReadonlySet<string> = new Set(['ask-hydrated-page.ts']);

const FOOTAGE_PAGES: ReadonlySet<string> = new Set(['render-page.ts']);

const noDecoder: BunPlugin = {
  name: 'no-decoder',
  setup(build) {
    build.onLoad({ filter: /\/browser\/footage-browser\.ts$/ }, (args) =>
      Effect.runPromise(
        FileSystem.FileSystem.use((fs) => fs.readFileString(args.path)).pipe(
          Effect.provide(BunServices.layer),
          Effect.map((source) => ({
            contents: source.replaceAll(
              "import('mediabunny')",
              "Promise.reject(new Error('this fixture page decodes no footage (bundles.ts FOOTAGE_PAGES)'))",
            ),
            loader: 'ts' as const,
          })),
        ),
      ),
    );
  },
};

export const compile = (entry: string) =>
  Effect.promise(() =>
    Bun.build({
      entrypoints: [`${import.meta.dir}/${entry}`],
      target: 'browser',
      format: 'iife',
      minify: true,
      sourcemap: 'inline',
      plugins: [
        solidPlugin,
        servedFonts,
        classicScript,
        ...Arr.filter([noDecoder], () => !FOOTAGE_PAGES.has(entry)),
      ],
      conditions: Arr.filter(['development'], () => DEVELOPMENT.has(entry)),
    }),
  ).pipe(
    Effect.flatMap((built) => {
      if (!built.success) return Effect.die(`${module} did not bundle: ${built.logs.join('\n')}`);
      return Option.match(Option.fromUndefinedOr(built.outputs[0]), {
        onNone: () => Effect.die(`${module} did not bundle: ${built.logs.join('\n')}`),
        onSome: (out) => Effect.promise(() => out.text()),
      });
    }),
  );

export const bundled = (entry: string) =>
  Effect.flatMap(Config.option(Config.String('FILM_TEST_BUNDLES')), (dir) =>
    Option.match(dir, {
      onNone: () => compile(entry),
      onSome: (root) =>
        FileSystem.FileSystem.use((fs) => fs.readFileString(`${root}/${entry}.js`)).pipe(
          Effect.orDie,
          Effect.provide(BunServices.layer),
        ),
    }),
  ).pipe(Effect.orDie);

interface Finding {
  readonly code: string;
  readonly message: string;
}

interface Diagnostics {
  readonly subscribe: (listener: (finding: Finding) => void) => () => void;
}

const isDiagnostics = (value: unknown): value is Diagnostics =>
  Predicate.hasProperty(value, 'subscribe') && Predicate.isFunction(value.subscribe);

const pure = (render: PageRender, diagnostics: Diagnostics): PageRender => ({
  bodyClass: render.bodyClass,
  render: (request, sink) => {
    const writes: Array<string> = [];
    const stop = diagnostics.subscribe((finding) => {
      if (finding.code === 'SERVER_WRITE') writes.push(finding.message);
    });
    render.render(request, {
      head: sink.head,
      write: sink.write,
      end: () =>
        void Effect.runFork(
          Effect.andThen(
            Effect.yieldNow,
            Effect.sync(() => {
              stop();
              if (writes.length === 0) return sink.end();
              sink.fail(`the page wrote state while the server rendered it: ${writes.join(' ')}`);
            }),
          ),
        ),
      fail: (reason) => {
        stop();
        sink.fail(reason);
      },
    });
  },
});

export const servedFile = (module: string, name: string): Effect.Effect<PageRender> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'film-test-server-' });
    const heard = `${import.meta.dir}/heard-${name}.ts`;
    const built = yield* Effect.promise(() =>
      Bun.build({
        entrypoints: [heard],
        files: {
          [heard]: `export { ${name} } from '${module}';\nexport { OBSERVE } from 'solid-js';\n`,
        },
        target: 'bun',
        plugins: [solidPluginFor('ssr'), servedFonts],
        outdir: dir,
        naming: 'server.js',
      }),
    );
    if (!built.success)
      return yield* Effect.die(`${module} did not bundle: ${built.logs.join('\n')}`);
    const loaded: unknown = yield* Effect.promise(() => import(`${dir}/server.js`));
    if (!Predicate.hasProperty(loaded, name) || !isPageRender(loaded[name]))
      return yield* Effect.die(`${module} exports no page render named ${name}`);
    const render = loaded[name];
    if (
      !Predicate.hasProperty(loaded, 'OBSERVE') ||
      !Predicate.hasProperty(loaded.OBSERVE, 'diagnostics') ||
      !isDiagnostics(loaded.OBSERVE.diagnostics)
    )
      return yield* Effect.die(
        `${module}'s bundle has no Solid diagnostics channel to hear a server write on`,
      );
    return pure(render, loaded.OBSERVE.diagnostics);
  }).pipe(Effect.scoped, Effect.orDie, Effect.provide(BunServices.layer));

export const served = (entry: string, name: string): Effect.Effect<PageRender> =>
  servedFile(`${import.meta.dir}/${entry}`, name);
