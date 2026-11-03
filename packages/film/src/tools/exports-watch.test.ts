import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, Exit, Fiber, Layer, Option, Path } from 'effect';
import { TestClock } from 'effect/testing';
import {
  Relaunch,
  exportsNow,
  relaunchOnExportsChange,
  watchExports,
  workspaceRoot,
} from './exports-watch.ts';
import { memoryFileSystem, text } from './host/testing.ts';

/** How often the test's watch reads. */
const EVERY = '3 seconds';

const FILM = (exports: string) =>
  `{ "name": "@w/film", "version": "1.0.0", "exports": ${exports} }\n`;

const workspace = () =>
  new Map<string, Uint8Array>([
    ['/w/package.json', text('{ "name": "w", "workspaces": ["packages/*", "apps/*"] }\n')],
    ['/w/packages/film/package.json', text(FILM('{ ".": "./src/index.ts" }'))],
    ['/w/packages/core/package.json', text('{ "name": "@w/core" }\n')],
    ['/w/apps/animations/package.json', text('{ "name": "animations" }\n')],
    ['/w/apps/animations/cli.ts', text('')],
  ]);

const inMemory = (files: Map<string, Uint8Array>) =>
  Layer.mergeAll(
    memoryFileSystem(files, new Set(['/w/packages', '/w/apps', '/w/apps/animations'])),
    Path.layer,
  );

/** What a watch's failure says: its tag and the files it names. */
const changed = (e: { readonly _tag: string; readonly files: ReadonlyArray<string> }) => ({
  _tag: e._tag,
  files: e.files,
});

const FILM_CHANGED = { _tag: 'ExportsChanged', files: ['packages/film/package.json'] };

describe('the exports watch', () => {
  it.effect('finds the root above an app, and none above the workspace', () => {
    const files = workspace();
    return Effect.gen(function* () {
      expect(yield* workspaceRoot('/w/apps/animations')).toEqual(Option.some('/w'));
      expect(yield* workspaceRoot('/elsewhere')).toEqual(Option.none());
    }).pipe(Effect.provide(inMemory(files)));
  });

  it.effect('ends with ExportsChanged once an exports map changes, and not before', () => {
    const files = workspace();
    return Effect.gen(function* () {
      const watch = yield* Effect.forkChild(watchExports(yield* exportsNow('/w'), EVERY));
      yield* TestClock.adjust(EVERY);
      files.set('/w/apps/animations/package.json', text('{ not json'));
      yield* TestClock.adjust(EVERY);
      expect(watch.pollUnsafe()).toBeUndefined();
      files.set('/w/apps/animations/package.json', text('{ "name": "animations" }\n'));
      files.set(
        '/w/packages/film/package.json',
        text(FILM('{ ".": "./src/index.ts" }').replace('1.0.0', '1.0.1')),
      );
      yield* TestClock.adjust(EVERY);
      expect(watch.pollUnsafe()).toBeUndefined();
      files.set(
        '/w/packages/film/package.json',
        text(FILM('{ ".": "./src/index.ts", "./style": "./src/style/index.ts" }')),
      );
      yield* TestClock.adjust(EVERY);
      const failed = yield* Effect.flip(Fiber.join(watch));
      expect(changed(failed)).toEqual(FILM_CHANGED);
    }).pipe(Effect.provide(inMemory(files)));
  });

  it.effect('a package.json caught mid-write, or gone a moment, ends nothing', () => {
    const files = workspace();
    return Effect.gen(function* () {
      const watch = yield* Effect.forkChild(watchExports(yield* exportsNow('/w'), EVERY));
      for (const caught of ['', '{ "name": "@w/film", "exp']) {
        files.set('/w/packages/film/package.json', text(caught));
        yield* TestClock.adjust(EVERY);
        expect(watch.pollUnsafe()).toBeUndefined();
      }
      files.delete('/w/packages/film/package.json');
      yield* TestClock.adjust(EVERY);
      expect(watch.pollUnsafe()).toBeUndefined();
      files.set('/w/packages/film/package.json', text(FILM('{ ".": "./src/index.ts" }')));
      yield* TestClock.adjust(EVERY);
      expect(watch.pollUnsafe()).toBeUndefined();
    }).pipe(Effect.provide(inMemory(files)));
  });

  it.effect(
    'a package.json caught mid-write is read again, and a change seen then ends the watch',
    () => {
      const files = workspace();
      return Effect.gen(function* () {
        const read = yield* exportsNow('/w');
        files.set('/w/packages/film/package.json', text(''));
        const watch = yield* Effect.forkChild(watchExports(read, EVERY));
        yield* Effect.yieldNow;
        files.set(
          '/w/packages/film/package.json',
          text(FILM('{ ".": "./src/index.ts", "./style": "./src/style/index.ts" }')),
        );
        yield* TestClock.adjust('250 millis');
        const failed = yield* Effect.flip(Fiber.join(watch));
        expect(changed(failed)).toEqual(FILM_CHANGED);
      }).pipe(Effect.provide(inMemory(files)));
    },
  );

  it.effect('holds the watch to the maps read before it began', () => {
    const files = workspace();
    return Effect.gen(function* () {
      const read = yield* exportsNow('/w');
      files.set(
        '/w/packages/film/package.json',
        text(FILM('{ ".": "./src/index.ts", "./style": "./src/style/index.ts" }')),
      );
      const watch = yield* Effect.forkChild(watchExports(read, EVERY));
      yield* TestClock.adjust(EVERY);
      const failed = yield* Effect.flip(Fiber.join(watch));
      expect(changed(failed)).toEqual(FILM_CHANGED);
    }).pipe(Effect.provide(inMemory(files)));
  });

  it.effect('closes the lab and what it holds, then starts it again', () => {
    const files = workspace();
    const seen: Array<string> = [];
    class Pages extends Context.Service<Pages, { readonly at: string }>()('test/Pages') {}
    const held = Layer.effect(
      Pages,
      Effect.acquireRelease(
        Effect.sync(() => Pages.of({ at: 'chrome' })),
        () => Effect.sync(() => seen.push('pages closed')),
      ),
    );
    const lab = Effect.gen(function* () {
      const read = yield* exportsNow('/w');
      const pages = yield* Pages;
      yield* Effect.addFinalizer(() => Effect.sync(() => seen.push('servers closed')));
      seen.push(`lab up over ${pages.at}`);
      return yield* watchExports(read, EVERY);
    });
    const relaunch = Layer.succeed(
      Relaunch,
      Relaunch.of({
        relaunch: (why) =>
          Effect.andThen(
            Effect.sync(() => seen.push(`relaunch: ${why}`)),
            Effect.die('started again'),
          ),
      }),
    );
    return Effect.gen(function* () {
      const running = yield* Effect.forkChild(Effect.exit(relaunchOnExportsChange(lab, held)));
      yield* TestClock.adjust(EVERY);
      expect(seen).toEqual(['lab up over chrome']);
      files.set(
        '/w/packages/film/package.json',
        text(FILM('{ ".": "./src/index.ts", "./style": "./src/style/index.ts" }')),
      );
      yield* TestClock.adjust(EVERY);
      const ended = yield* Fiber.join(running);
      expect(Exit.isFailure(ended)).toBe(true);
      expect(seen).toEqual([
        'lab up over chrome',
        'servers closed',
        'pages closed',
        'relaunch: the exports of packages/film/package.json changed: the lab starts again to resolve them',
      ]);
    }).pipe(Effect.provide(Layer.merge(relaunch, inMemory(files))));
  });
});
