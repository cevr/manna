import { describe, expect, it } from 'effect-bun-test';
import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Path } from 'effect';
import { checkoutRootsOf } from './checkouts.ts';

const checkout = (dir: string, name: string, made = 'out') =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.join(dir, 'apps', 'animations', made), { recursive: true });
    yield* fs.writeFileString(path.join(dir, 'package.json'), `{ "name": "${name}" }`);
  });

describe('the checkouts', () => {
  it.effect(
    'are the folders whose root package is this one: a Rift’s siblings, never its warm source',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = yield* fs.makeTempDirectoryScoped();
        const rifts = path.join(home, '.rifts', 'bible-tools');
        yield* checkout(path.join(home, 'bible-tools'), 'bible');
        for (const rift of ['p5', 'rbfscene', 'oneline', 'seedanim', 'rimproto'])
          yield* checkout(path.join(rifts, rift), 'bible');
        yield* checkout(path.join(rifts, 'empty'), 'bible', 'src');
        yield* checkout(path.join(home, 'bible-hymns'), 'hymns');
        yield* checkout(path.join(rifts, 'not-json'), 'bible');
        yield* fs.writeFileString(path.join(rifts, 'not-json', 'package.json'), '{');
        const labels = (repo: string) =>
          Effect.map(checkoutRootsOf(repo), (roots) => roots.map((root) => root.label));
        const rifted = ['oneline', 'p5', 'rbfscene', 'rimproto', 'seedanim'];
        expect(yield* labels(path.join(rifts, 'p5'))).toEqual(rifted);
        expect(yield* labels(path.join(home, 'bible-tools'))).toEqual(['bible-tools', ...rifted]);
        const [first] = yield* checkoutRootsOf(path.join(rifts, 'p5'));
        expect(first?.path).toBe(path.join(rifts, 'oneline', 'apps', 'animations', 'out'));
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    'a lab leaves out the checkout its worktree was made from, and every warm source but its own',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
        const rifts = path.join(home, '.rifts', 'bible-tools');
        const worktree = (main: string, dir: string) =>
          Effect.gen(function* () {
            const admin = path.join(main, '.git', 'worktrees', path.basename(dir));
            yield* checkout(dir, 'bible');
            yield* fs.makeDirectory(admin, { recursive: true });
            yield* fs.writeFileString(path.join(admin, 'commondir'), '../..\n');
            yield* fs.writeFileString(path.join(dir, '.git'), `gitdir: ${admin}\n`);
          });
        const warm = path.join(home, 'bible-tools');
        yield* checkout(warm, 'bible');
        yield* fs.makeDirectory(path.join(warm, '.git'));
        yield* worktree(warm, path.join(home, 'bible-tools-batch'));
        yield* checkout(path.join(rifts, 'p5'), 'bible');
        yield* fs.makeDirectory(path.join(rifts, 'p5', '.git'));
        yield* checkout(path.join(rifts, 'oneline'), 'bible');
        yield* worktree(path.join(rifts, 'p5'), path.join(rifts, 'unit'));
        yield* worktree(path.join(rifts, 'p5'), path.join(home, 'bible-tools-of-p5'));
        yield* checkout(path.join(home, 'bible-tools-clone'), 'bible');
        yield* fs.makeDirectory(path.join(home, 'bible-tools-clone', '.git'));
        const labels = (repo: string) =>
          Effect.map(checkoutRootsOf(repo), (roots) => roots.map((root) => root.label));
        const beside = ['bible-tools-batch', 'bible-tools-clone', 'bible-tools-of-p5'];
        for (const one of beside)
          expect([one, yield* labels(path.join(home, one))]).toEqual([one, beside]);
        expect(yield* labels(path.join(rifts, 'unit'))).toEqual(['oneline', 'unit']);
        expect(yield* labels(warm)).toEqual(['bible-tools', ...beside, 'oneline', 'p5', 'unit']);
        expect(yield* labels(path.join(rifts, 'p5'))).toEqual(['oneline', 'p5', 'unit']);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    'a checkout whose root package is still `bible` is listed beside `manna`, and `manna` answers to `bible-tools`',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = yield* fs.makeTempDirectoryScoped();
        const rifts = path.join(home, '.rifts', 'manna');
        yield* checkout(path.join(home, 'manna'), 'manna');
        yield* checkout(path.join(rifts, 'rbf-arms-rig'), 'bible');
        yield* checkout(path.join(rifts, 'film-motion-proto'), 'bible');
        yield* checkout(path.join(rifts, 'hymnapp-main'), 'manna');
        yield* checkout(path.join(rifts, 'bible-hymns'), 'hymns');
        const roots = yield* checkoutRootsOf(path.join(home, 'manna'));
        expect(roots.map((root) => root.label)).toEqual([
          'film-motion-proto',
          'hymnapp-main',
          'manna',
          'rbf-arms-rig',
        ]);
        expect(
          (yield* checkoutRootsOf(path.join(rifts, 'rbf-arms-rig'))).map((root) => root.label),
        ).toEqual(['film-motion-proto', 'hymnapp-main', 'rbf-arms-rig']);
        expect(roots.map((root) => [root.label, root.aliases])).toEqual([
          ['film-motion-proto', []],
          ['hymnapp-main', []],
          ['manna', ['bible-tools']],
          ['rbf-arms-rig', []],
        ]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('a real checkout labelled `bible-tools` is listed as its own root', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped();
      yield* checkout(path.join(home, 'manna'), 'manna');
      yield* checkout(path.join(home, 'bible-tools'), 'bible');
      const roots = yield* checkoutRootsOf(path.join(home, 'manna'));
      expect(roots.map((root) => [root.label, root.path])).toEqual([
        ['bible-tools', path.join(home, 'bible-tools', 'apps', 'animations', 'out')],
        ['manna', path.join(home, 'manna', 'apps', 'animations', 'out')],
      ]);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('a Rift made from a Rift leaves its source a Rift, never a warm source', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped();
      const rifts = path.join(home, '.rifts', 'bible-tools');
      yield* checkout(path.join(home, 'bible-tools'), 'bible');
      yield* checkout(path.join(rifts, 'p5'), 'bible');
      yield* checkout(path.join(rifts, 'rbfscene'), 'bible');
      yield* checkout(path.join(rifts, '.rifts', 'p5', 'n2'), 'bible');
      yield* checkout(path.join(rifts, '.rifts', 'rbfscene', 'n1'), 'bible');
      const labels = (repo: string) =>
        Effect.map(checkoutRootsOf(repo), (roots) => roots.map((root) => root.label));
      expect(yield* labels(path.join(rifts, 'p5'))).toEqual(['n2', 'p5', 'rbfscene']);
      expect(yield* labels(path.join(rifts, 'rbfscene'))).toEqual(['n1', 'p5', 'rbfscene']);
      expect(yield* labels(path.join(home, 'bible-tools'))).toEqual([
        'bible-tools',
        'p5',
        'rbfscene',
      ]);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
