import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Path } from 'effect';
import { ContentStore } from './content-store.ts';
import { FilmFolder, FilmRepo } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';
import { scenesLocatedHere } from './read-cli.ts';
import { SceneSources } from './scene-sources.ts';
import { sceneFixture } from './scene-sources/testing.ts';

class Films extends Context.Service<Films, string>()('test/Films') {}

const fixture = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const films = yield* sceneFixture(yield* fs.makeTempDirectoryScoped());
    return scenesLocatedHere.pipe(
      Layer.provide(FilmRepo.layer(films)),
      Layer.provide(ContentStore.layer),
      Layer.merge(Layer.succeed(Films, films)),
    );
  }),
).pipe(Layer.provideMerge(BunServices.layer));

const SPAWNS_MS = 30_000;

const lab = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const films = yield* sceneFixture(yield* fs.makeTempDirectoryScoped());
    const cli = path.join(import.meta.dir, 'fixtures', 'read-cli.ts');
    return SceneSources.layer.pipe(
      Layer.provide(FreshFilm.layer(['bun', cli, films])),
      Layer.provide(FilmFolder.layer(films)),
      Layer.merge(Layer.succeed(Films, films)),
    );
  }),
).pipe(Layer.provideMerge(BunServices.layer));

const GAMMA = `import { drawing } from './drawing.ts';

export const gamma = drawing({ timeline: { go: { at: 'start', dur: 1 } }, draw: () => {} });
`;

const open = { timeline: { _tag: 'Writable' }, knobs: { _tag: 'Writable' } } as const;

describe('scene sources', () => {
  it.effect('finds each scene by the objects it reads', () =>
    Effect.gen(function* () {
      const films = yield* Films;
      const path = yield* Path.Path;
      const sources = yield* SceneSources;
      const scenes = path.join(films, 'f', 'scenes');
      const located = yield* sources.locate('f');
      expect([...located.sites.values()]).toEqual([
        {
          scene: 'hand',
          file: path.join(scenes, 'hand.ts'),
          shown: 'scenes/hand.ts',
          exportName: 'hand_',
          access: open,
        },
        {
          scene: 'beta',
          file: path.join(scenes, 'a.ts'),
          shown: 'scenes/a.ts',
          exportName: 'alpha',
          access: open,
        },
      ]);
      expect(located.unlocated.map((u) => [u.scene, u.reason])).toEqual([
        [
          'built',
          'no exported drawing({...}) in the film folder declares the timeline or knobs it reads',
        ],
      ]);
      const error = yield* Effect.flip(sources.site('f', 'plain'));
      expect(error.message).toContain('scene "plain" has no editable drawing');
      const code = yield* sources.code('f', 'hand');
      expect(code.site.shown).toBe('scenes/hand.ts');
      expect(code.cues.map((c) => [c.name, code.text.slice(...c.at).split(':')[0]])).toEqual([
        ['topple', 'topple'],
        ['late', 'late'],
      ]);
    }).pipe(Effect.provide(fixture)),
  );

  it.effect(
    "the lab's locate finds a scene added after its first, without a restart",
    () =>
      Effect.gen(function* () {
        const films = yield* Films;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const sources = yield* SceneSources;
        const scenes = path.join(films, 'f', 'scenes');
        expect([...(yield* sources.locate('f')).sites.keys()]).toEqual(['hand', 'beta']);
        yield* fs.writeFileString(path.join(scenes, 'gamma.ts'), GAMMA);
        const registry = path.join(scenes, 'index.ts');
        const index = yield* fs.readFileString(registry);
        yield* fs.writeFileString(
          registry,
          index
            .replace('import { hand }', "import { gamma } from './gamma.ts';\nimport { hand }")
            .replace("  { id: 'plain' },", "  { id: 'plain' },\n  { id: 'gamma', ...gamma },"),
        );
        const site = yield* sources.site('f', 'gamma');
        expect([site.shown, site.exportName]).toEqual(['scenes/gamma.ts', 'gamma']);
      }).pipe(Effect.provide(lab)),
    // oxlint-disable-next-line film/tests-keep-their-strength -- the scene sources read the registry in a fresh process, a spawn inside the service the test provides (spawn budget).
    SPAWNS_MS,
  );
});
