import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Option, Path, Ref } from 'effect';
import { PageBundler } from './lab-page.ts';
import {
  Platform,
  appFolder,
  served,
  buildOf,
  MIXED_AT,
  filmsInMemory,
} from './fixtures/lab-app.ts';

describe("a film's mixes", () => {
  it.live(
    "a mix that lands the track a page was served wakes its wait and builds nothing; the take's timings saved before the mix wake nothing",
    () =>
      Effect.gen(function* () {
        const { spec } = yield* appFolder;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const bundles = yield* Ref.make(0);
        const counted = Layer.effect(
          PageBundler,
          Effect.gen(function* () {
            const bundler = yield* PageBundler;
            return PageBundler.of({
              bundle: (entries, root, how) =>
                Effect.andThen(
                  Ref.update(bundles, (n) => n + 1),
                  bundler.bundle(entries, root, how),
                ),
            });
          }),
        ).pipe(Layer.provide(PageBundler.layerTest));
        const film = path.join(spec.films, 'f');
        const narration = path.join(film, 'narration');
        yield* fs.makeDirectory(path.join(film, 'scenes'), { recursive: true });
        yield* fs.makeDirectory(narration, { recursive: true });
        yield* fs.writeFileString(path.join(film, 'scenes', 'index.ts'), 'export {};\n');
        yield* fs.writeFileString(path.join(narration, 'full.wav'), 'mix one');
        yield* fs.writeFileString(path.join(narration, 'timings.json'), '{}');
        const { page, ask } = yield* served(spec, counted);
        yield* ask('/films/f/export');
        expect((yield* ask('/films/f/narration/full.wav')).text).toBe('mix one');
        const f = { server: Option.none(), film: Option.some('f') };
        const settled = (yield* page.wait({ since: 0, ...f }, '1 second')).build;
        const timed = yield* Effect.andThen(
          fs.writeFileString(path.join(narration, 'timings.json'), '{"voice":""}'),
          page.wait({ since: settled, ...f }, '1 second'),
        );
        expect(timed.build).toBe(settled);
        yield* fs.writeFileString(path.join(narration, 'full.wav.partial'), 'mix two');
        const mixed = yield* Effect.andThen(
          fs.rename(path.join(narration, 'full.wav.partial'), path.join(narration, 'full.wav')),
          page.wait({ since: settled, ...f }, '5 seconds'),
        );
        expect(mixed.build).toBeGreaterThan(settled);
        const built = yield* Ref.get(bundles);
        expect(buildOf((yield* ask('/films/f/export')).text)).toBeGreaterThanOrEqual(mixed.build);
        expect(yield* Ref.get(bundles)).toBe(built);
        expect((yield* ask('/films/f/narration/full.wav')).text).toBe('mix two');
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    "a film's first mix, with no track and no narration folder when its page loaded, wakes that page's wait",
    () =>
      Effect.gen(function* () {
        const { spec } = yield* appFolder;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const film = path.join(spec.films, 'f');
        yield* fs.makeDirectory(path.join(film, 'scenes'), { recursive: true });
        yield* fs.writeFileString(path.join(film, 'scenes', 'index.ts'), 'export {};\n');
        const { page, ask } = yield* served(spec, PageBundler.layerTest);
        yield* ask('/films/f/export');
        expect((yield* ask('/films/f/narration/full.wav')).status).toBe(404);
        const f = { server: Option.none(), film: Option.some('f') };
        const settled = (yield* page.wait({ since: 0, ...f }, '1 second')).build;
        const narration = path.join(film, 'narration');
        const mixed = yield* Effect.andThen(
          Effect.gen(function* () {
            yield* fs.makeDirectory(narration, { recursive: true });
            yield* fs.writeFileString(path.join(narration, 'full.wav.partial'), 'mix one');
            yield* fs.rename(
              path.join(narration, 'full.wav.partial'),
              path.join(narration, 'full.wav'),
            );
          }),
          page.wait({ since: settled, ...f }, '5 seconds'),
        );
        expect(mixed.build).toBeGreaterThan(settled);
        expect((yield* ask('/films/f/narration/full.wav')).text).toBe('mix one');
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live("one film's mix wakes its own page's wait, never another film's", () =>
    Effect.gen(function* () {
      const { page, ask, mix, armed } = yield* filmsInMemory;
      for (const name of ['f', 'g']) {
        yield* ask(`/films/${name}/export`);
        expect((yield* ask(`/films/${name}/narration/full.wav`)).text).toBe(`${name} one`);
        yield* armed(name);
      }
      const of = (name: string) => ({ server: Option.none(), film: Option.some(name) });
      const settled = (yield* page.wait({ since: 0, ...of('f') }, 0)).build;
      const forG = yield* Effect.andThen(
        mix('g', 'g two'),
        page.wait({ since: settled, ...of('g') }, '2 seconds'),
      );
      expect(forG.build).toBeGreaterThan(settled);
      expect((yield* page.wait({ since: settled, ...of('f') }, 0)).build).toBe(settled);
    }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    "a write's own mix is named by the build its film's pages hear it at, counted at once if no watch has; a later mix is a later build, and the earlier keeps its own",
    () =>
      Effect.gen(function* () {
        const { page, ask, land, mix } = yield* filmsInMemory;
        expect(yield* page.heardAt('f', MIXED_AT)).toEqual(Option.none());
        yield* ask('/films/f/export');
        yield* ask('/films/f/narration/full.wav');
        const f = { server: Option.none(), film: Option.some('f') };
        const settled = (yield* page.wait({ since: 0, ...f }, 0)).build;
        expect(yield* page.heardAt('f', MIXED_AT)).toEqual(Option.none());
        const two = yield* land('f', 'mix two');
        const ownTwo = yield* page.heardAt('f', two);
        expect(Option.map(ownTwo, (b) => b.build > settled)).toEqual(Option.some(true));
        const heard = yield* page.wait({ since: settled, ...f }, '2 seconds');
        expect(Option.some(heard)).toEqual(ownTwo);
        const three = yield* mix('f', 'mix three');
        const ownThree = yield* page.heardAt('f', three);
        expect(
          Option.exists(ownThree, (b) => Option.exists(ownTwo, (a) => b.build > a.build)),
        ).toBe(true);
        expect(yield* page.heardAt('f', two)).toEqual(ownTwo);
        expect(yield* page.heardAt('g', three)).toEqual(Option.none());
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    "a page that waits with its film hears the film's mix, though it never played the track",
    () =>
      Effect.gen(function* () {
        const { page, ask, mix, armed } = yield* filmsInMemory;
        yield* ask('/films/f/choices');
        const f = { server: Option.none(), film: Option.some('f') };
        const settled = (yield* page.wait({ since: 0, ...f }, 0)).build;
        yield* armed('f');
        const mixed = yield* Effect.andThen(
          mix('f', 'mix two'),
          page.wait({ since: settled, ...f }, '2 seconds'),
        );
        expect(mixed.build).toBeGreaterThan(settled);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );
});
