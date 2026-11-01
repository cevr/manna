// Each stage kind's sources are the closure of the local files its entry
// modules run, so a code change anywhere a stage runs reaches its key: a
// change to `core/unmatte.ts`, which the puppet a shard renders runs, stales
// a warm renders stage with no VERSION bump.

import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Path } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import { ContentStore } from '../content-store.ts';
import { memoryLocks, text } from '../host/testing.ts';
import { castRoot } from './built.ts';
import { type Input, type Stage, buildGraph } from './graph.ts';
import { FILMS, RENDER_PAGE, serve } from '../../../../../apps/animations/server.ts';
import { filmCastSources, pageSources, stageSources } from './sources.ts';

/** The files among inputs, by path. */
const pathsOf = (inputs: ReadonlyArray<Input>) =>
  inputs.flatMap((i) => {
    if (i._tag === 'File') return [i.path];
    return [];
  });

/** A stage kind's source files, as `stageSources` makes them its inputs. */
const sourceFiles = (kind: keyof Effect.Success<typeof stageSources>) =>
  Effect.map(stageSources, (all) => pathsOf(all[kind]));

const local = Layer.mergeAll(BunFileSystem.layer, Path.layer);
const ends = (files: ReadonlyArray<string>) => files.map((f) => f.split('/src/').at(-1));
const UNMATTE = new URL('../../core/unmatte.ts', import.meta.url).pathname;
/** A file of the render page's, by its path from the framework's `src`. */
const player = (file: string) => new URL(`../../player/${file}`, import.meta.url).pathname;

describe('stage sources', () => {
  it.effect('every stage kind runs files of this repo, none of node_modules, each on disk', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      for (const kind of ['parts', 'cut', 'fit', 'renders', 'eval', 'chain'] as const) {
        const files = yield* sourceFiles(kind);
        expect({ kind, some: files.length > 0 }).toEqual({ kind, some: true });
        const outside = files.filter((f) => f.includes('/node_modules/'));
        expect({ kind, outside }).toEqual({ kind, outside: [] });
        const missing = [];
        for (const file of files) if (!(yield* fs.exists(file))) missing.push(file);
        expect({ kind, missing }).toEqual({ kind, missing: [] });
      }
    }).pipe(Effect.provide(local)),
  );

  it.effect('renders run the sampler, the puppet and its unmatte; the clip eval its chain', () =>
    Effect.gen(function* () {
      expect(ends(yield* sourceFiles('renders'))).toEqual(
        expect.arrayContaining([
          'core/pose-sample.ts',
          'core/puppet.ts',
          'core/unmatte.ts',
          'tools/cast-build/renders.ts',
        ]),
      );
      expect(ends(yield* sourceFiles('chain'))).toEqual(
        expect.arrayContaining([
          'tools/cast-build/chain.ts',
          'tools/cast-build/chain-fit.ts',
          'core/pose-fit.ts',
        ]),
      );
      expect(ends(yield* sourceFiles('fit'))).toEqual(
        expect.arrayContaining(['tools/cast-render.ts', 'core/fit-rows.ts', 'core/unmatte.ts']),
      );
    }).pipe(Effect.provide(local)),
  );

  it.effect('a change to core/unmatte.ts stales a warm renders stage, no version bumped', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const cache = yield* fs.makeTempDirectoryScoped({ prefix: 'cast-sources-' });
      const sources = yield* stageSources;
      const stages: ReadonlyArray<Stage<never>> = [
        {
          id: 'renders:front@m',
          inputs: sources.renders,
          version: '1',
          run: () => Effect.succeed(text('shard')),
        },
      ];
      const options = { root: castRoot, cache, plan: false, touch: [], spend: new Set<never>() };
      const warm = yield* buildGraph(stages, options);
      expect(warm.stages.map((s) => s.state)).toEqual(['ran']);
      const again = yield* buildGraph(stages, { ...options, plan: true });
      expect(again.stages.map((s) => s.state)).toEqual(['cached']);
      const touched = yield* buildGraph(stages, { ...options, plan: true, touch: [UNMATTE] });
      expect(touched.stages.map((s) => s.state)).toEqual(['stale']);
    }).pipe(
      Effect.scoped,
      Effect.provide(ContentStore.layer.pipe(Layer.provideMerge([local, memoryLocks]))),
    ),
  );

  it.effect('the fit’s page is the one the app’s preview server answers at `/`', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const server = yield* Effect.acquireRelease(
        Effect.sync(() =>
          serve(0, FILMS, { dir: '/nonexistent/footage', out: '/nonexistent/footage' }),
        ),
        (running) => Effect.promise(() => running.stop(true)),
      );
      const served = yield* HttpClient.get(server.url).pipe(
        Effect.flatMap((response) => response.text),
        Effect.orDie,
      );
      // the server answers the page bundled: its scripts and stylesheets linked as
      // chunks, the rest of its HTML as written
      const bare = (html: string) =>
        html
          .replace(/<script\b[^>]*>\s*<\/script>|<link\b[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      expect(bare(served)).toBe(bare(yield* fs.readFileString(RENDER_PAGE)));
      expect(served).toMatch(/<script\b[^>]*\bsrc="\/chunk-/);
      // the page's closure reaches the export half of the page, which no import of the render does
      expect(ends(yield* Effect.map(pageSources(RENDER_PAGE), pathsOf))).toEqual(
        expect.arrayContaining([
          'main.ts',
          'player/cast.ts',
          'player/render.ts',
          'player/still.ts',
          'player/dom.ts',
        ]),
      );
    }).pipe(Effect.scoped, Effect.provide([local, FetchHttpClient.layer])),
  );

  it.effect('a change to the page or the film’s cast module stales a warm fit stage', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const cache = yield* fs.makeTempDirectoryScoped({ prefix: 'cast-sources-' });
      const sources = yield* stageSources;
      const film = new URL('../../../../../apps/animations/src/films/in-its-order', import.meta.url)
        .pathname;
      const stages: ReadonlyArray<Stage<never>> = [
        {
          id: 'fit:front@m',
          inputs: [
            ...sources.fit,
            ...(yield* pageSources(RENDER_PAGE)),
            ...(yield* filmCastSources(film)),
          ],
          version: '1',
          run: () => Effect.succeed(text('rows')),
        },
      ];
      const options = { root: castRoot, cache, plan: false, touch: [], spend: new Set<never>() };
      expect((yield* buildGraph(stages, options)).stages.map((s) => s.state)).toEqual(['ran']);
      const stateAfter = (touch: ReadonlyArray<string>) =>
        Effect.map(buildGraph(stages, { ...options, plan: true, touch }), (r) =>
          r.stages.map((s) => s.state),
        );
      expect(yield* stateAfter([])).toEqual(['cached']);
      for (const file of ['cast.ts', 'render.ts', 'still.ts', 'dom.ts'])
        expect(yield* stateAfter([player(file)])).toEqual(['stale']);
      expect(yield* stateAfter([RENDER_PAGE])).toEqual(['stale']);
      expect(yield* stateAfter([`${film}/rigs/cast.ts`])).toEqual(['stale']);
    }).pipe(
      Effect.scoped,
      Effect.provide(ContentStore.layer.pipe(Layer.provideMerge([local, memoryLocks]))),
    ),
  );
});
