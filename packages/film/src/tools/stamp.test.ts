// A scene's key follows what its frames are drawn from: its own module and
// what that imports, the film's frame, and the scene it enters from; an edit
// to another scene's module leaves it alone.

import * as BunServices from '@effect/platform-bun/BunServices';
import { expect as expectPlain, test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Option, Path, Result, Sink, Stream } from 'effect';
import { ChildProcessSpawner } from 'effect/process';
import { beatTime, layout } from '../core/layout.ts';
import { secondsAt } from '../core/time.ts';
import { ContentStore } from './content-store.ts';
import { FilmRepo } from './film-repo.ts';
import { spokenTake } from './film-repo/testing.ts';
import { memoryFileSystem, text } from './host/testing.ts';
import { scenesLocatedHere } from './read-cli.ts';
import { SceneSources } from './scene-sources.ts';
import { type Keyed, Stamps, importsOf, stampOf } from './stamp.ts';
import { sceneFixture } from './scene-sources/testing.ts';
import { resolveAddress } from '../core/address.ts';

/** The fixture film's folder: a fresh one per test. */
class Films extends Context.Service<Films, string>()('test/Films') {}

/** The fixture film's Stamps, asking `git` for the commit through `spawner`. */
const fixtureOver = <E, R>(spawner: Layer.Layer<never, E, R>) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const films = yield* sceneFixture(yield* fs.makeTempDirectoryScoped());
      return Stamps.layer.pipe(
        Layer.provide(spawner),
        Layer.provideMerge(scenesLocatedHere),
        Layer.provide(FilmRepo.layer(films)),
        Layer.provide(ContentStore.layer),
        Layer.merge(Layer.succeed(Films, films)),
      );
    }),
  ).pipe(Layer.provideMerge(BunServices.layer));

/**
 * `git` as it answers outside a checkout (exit 128, no commit), with no
 * process: the keys' cases read the keys, and the commit case asks real git.
 */
const outsideACheckout = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() =>
    Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(0),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(128)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: Sink.drain,
        stdout: Stream.empty,
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      }),
    ),
  ),
);

const fixture = fixtureOver(outsideACheckout);
/** The fixture's Stamps over the real `git`, run in the fixture's folder. */
const gitFixture = fixtureOver(Layer.empty);

// The registry's scenes in order; `plain` enters on a transition from `built`, `beta` on a cut.
const placed = Result.getOrThrow(
  layout(
    [
      { id: 'hand', min: 2 },
      { id: 'beta', min: 2 },
      { id: 'built', min: 2 },
      { id: 'plain', min: 2, enter: { kind: 'fade', dur: 0.5 } },
    ],
    { voice: '', scenes: {} },
    30,
  ),
);

const film = (films: string, path: Path.Path): Keyed => ({
  paths: { name: 'f', dir: path.join(films, 'f') },
  timings: { voice: '', scenes: {} },
});

/** Every scene's key now. */
const keysNow = Effect.gen(function* () {
  const films = yield* Films;
  const path = yield* Path.Path;
  const { keys } = yield* (yield* Stamps).scenes(film(films, path), placed);
  return Object.fromEntries(keys);
});

/** Append a line to a file of the fixture's scenes folder. */
const touch = (name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.join(yield* Films, 'f', 'scenes', name);
    yield* fs.writeFileString(file, `${yield* fs.readFileString(file)}// edited\n`);
  });

/** The scenes whose key changed from `before` to `after`. */
const changed = (before: Record<string, string>, after: Record<string, string>) =>
  Object.keys(before).filter((id) => before[id] !== after[id]);

describe.concurrent('scene keys', () => {
  it.effect("an edit to one scene's module changes its key alone", () =>
    Effect.gen(function* () {
      const before = yield* keysNow;
      expect(Object.keys(before)).toEqual(['hand', 'beta', 'built', 'plain']);
      yield* touch('hand.ts');
      expect(changed(before, yield* keysNow)).toEqual(['hand']);
      // Unchanged sources, the same keys.
      const again = yield* keysNow;
      expect(changed(again, yield* keysNow)).toEqual([]);
    }).pipe(Effect.provide(fixture)),
  );

  it.effect('an edit to a module the scenes import changes every scene that imports it', () =>
    Effect.gen(function* () {
      const before = yield* keysNow;
      yield* touch('drawing.ts');
      expect(changed(before, yield* keysNow)).toEqual(['hand', 'beta']);
    }).pipe(Effect.provide(fixture)),
  );

  it.effect("an edit to the registry (the film's frame) changes every scene", () =>
    Effect.gen(function* () {
      const before = yield* keysNow;
      yield* touch('index.ts');
      expect(changed(before, yield* keysNow)).toEqual(['hand', 'beta', 'built', 'plain']);
    }).pipe(Effect.provide(fixture)),
  );

  it.effect("a scene entering on a transition draws the previous scene's modules", () =>
    Effect.gen(function* () {
      // `built` has no module of its own; `beta` (declared in a.ts) enters on a cut from `hand`.
      const before = yield* keysNow;
      yield* touch('a.ts');
      expect(changed(before, yield* keysNow)).toEqual(['beta']);
      const films = yield* Films;
      const path = yield* Path.Path;
      const faded = Result.getOrThrow(
        layout(
          [
            { id: 'hand', min: 2 },
            { id: 'beta', min: 2, enter: { kind: 'fade', dur: 0.5 } },
          ],
          { voice: '', scenes: {} },
          30,
        ),
      );
      const stamps = yield* Stamps;
      const one = (yield* stamps.scenes(film(films, path), faded)).keys.get('beta');
      yield* touch('hand.ts');
      const two = (yield* stamps.scenes(film(films, path), faded)).keys.get('beta');
      expect(one).not.toEqual(two);
    }).pipe(Effect.provide(fixture)),
  );

  it.effect('outside a git checkout the stamp has no commit', () =>
    Effect.gen(function* () {
      const films = yield* Films;
      const path = yield* Path.Path;
      const keys = yield* (yield* Stamps).scenes(film(films, path), placed);
      expect(keys.commit).toEqual(Option.none());
      const scope = Result.getOrThrow(
        resolveAddress(
          { name: 'f', placed, look: Option.none(), shorts: [] },
          { _tag: 'Scenes', ids: ['hand'] },
        ),
      );
      const stamp = stampOf(keys, scope);
      expect(stamp.key).toMatch(/^[0-9a-f]{64}$/);
      // Another address over the same scene is another stamp.
      const whole = Result.getOrThrow(
        resolveAddress({ name: 'f', placed, look: Option.none(), shorts: [] }, { _tag: 'Film' }),
      );
      expect(stampOf(keys, whole).key).not.toEqual(stamp.key);
      // A wedge (`render --level`) is another stamp, its levels in any order the same;
      // no levels is the stamp as written.
      expect(stampOf(keys, scope, {}).key).toEqual(stamp.key);
      const wedged = stampOf(keys, scope, { style: 'ps1', ground: 'light' }).key;
      expect(wedged).not.toEqual(stamp.key);
      expect(stampOf(keys, scope, { ground: 'light', style: 'ps1' }).key).toEqual(wedged);
    }).pipe(Effect.provide(gitFixture)),
  );
});

/** How many times the stamp read each file. */
class Reads extends Context.Service<Reads, Map<string, number>>()('test/Reads') {}

/** The fixture's Stamps, over a file system that counts what it reads. */
const counting = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const films = yield* sceneFixture(yield* fs.makeTempDirectoryScoped());
    const counted = Layer.effect(
      FileSystem.FileSystem,
      Effect.gen(function* () {
        const real = yield* FileSystem.FileSystem;
        const reads = yield* Reads;
        return FileSystem.FileSystem.of({
          ...real,
          readFileString: (file, encoding) => {
            reads.set(file, (reads.get(file) ?? 0) + 1);
            return real.readFileString(file, encoding);
          },
        });
      }),
    );
    return Stamps.layer.pipe(
      Layer.provide(counted),
      Layer.provideMerge(scenesLocatedHere),
      Layer.provide(FilmRepo.layer(films)),
      Layer.provide(ContentStore.layer),
      Layer.merge(Layer.succeed(Films, films)),
    );
  }),
).pipe(
  Layer.provideMerge(Layer.sync(Reads, () => new Map<string, number>())),
  Layer.provideMerge(BunServices.layer),
);

describe.concurrent('the stamp’s reads', () => {
  it.effect('read, hash and parse each file once per call, however many scenes import it', () =>
    Effect.gen(function* () {
      yield* keysNow;
      const reads = yield* Reads;
      expect(reads.size).toBeGreaterThan(3);
      expect([...reads].filter(([, n]) => n > 1)).toEqual([]);
    }).pipe(Effect.provide(counting)),
  );
});

/**
 * Film `f` in memory: its frame, a registry that reads the script, and the
 * script with `hand`'s tail `tail`. No scene has a module of its own.
 */
const inMemory = (tail: number) => {
  const files = new Map([
    [
      '/films/f/film.ts',
      text("import { scenes } from './scenes/index.ts';\nexport const fps = 30;\n"),
    ],
    [
      '/films/f/scenes/index.ts',
      text("import { script } from '../script.ts';\nexport const scenes = script;\n"),
    ],
    ['/films/f/script.ts', scriptOf(tail)],
  ]);
  const layer = Stamps.layer.pipe(
    Layer.provide(
      Layer.effect(
        SceneSources,
        SceneSources.over(() => Effect.succeed({ sites: new Map(), unlocated: [] })),
      ),
    ),
    Layer.provide([outsideACheckout, memoryFileSystem(files), Path.layer]),
  );
  return { files, layer };
};

/** The script of film `f` in memory, with `hand`'s tail `tail`. */
const scriptOf = (tail: number) =>
  text(`export const script = [
  { id: 'hand', say: 'Hi.', tail: ${tail} },
  { id: 'beta', say: 'Hi.' },
  { id: 'built', say: 'Hi.' },
  { id: 'plain', say: 'Hi.' },
];
`);

const inMemoryFilm: Keyed = {
  paths: { name: 'f', dir: '/films/f' },
  timings: { voice: '', scenes: {} },
};

describe.concurrent('beat keys in memory', () => {
  it.effect('a script edited re-keys every beat: the script is hashed whole', () => {
    const { files, layer } = inMemory(0);
    return Effect.gen(function* () {
      const stamps = yield* Stamps;
      const was = Object.fromEntries((yield* stamps.scenes(inMemoryFilm, placed)).beats);
      files.set('/films/f/script.ts', scriptOf(1));
      const now = Object.fromEntries((yield* stamps.scenes(inMemoryFilm, placed)).beats);
      expect(changed(was, now)).toEqual(['hand', 'beta', 'built', 'plain']);
    }).pipe(Effect.provide(layer));
  });

  /**
   * At each rate: each beat's first frame after takes of 3.6 s and 3.2 s,
   * then 4.1 s and 2.7 s (3.6 + 3.2 is 6.800000000000001 and 4.1 + 2.7 is
   * 6.8), and how many frames into `built` its half second falls.
   */
  const RATES = [
    { fps: 24, was: [0, 86, 163], now: [0, 98, 163], half: 12 },
    { fps: 30, was: [0, 108, 204], now: [0, 123, 204], half: 15 },
    { fps: 30000 / 1001, was: [0, 108, 204], now: [0, 123, 204], half: 15 },
  ];

  it.effect(
    'a beat after takes that change but end where they did keeps its first frame and its key, and reads the same time on each frame',
    () =>
      Effect.gen(function* () {
        const stamps = yield* Stamps;
        const scenes = [
          { id: 'hand', say: 'Hi.', lead: 0, tail: 0 },
          { id: 'beta', say: 'Hi.', lead: 0, tail: 0 },
          { id: 'built', min: 10 },
        ];
        for (const at of RATES) {
          /** Each beat's first frame, `built`'s key, and the time it hands its painter on its frames around its half second. */
          const laidWith = (durations: readonly [number, number]) =>
            Effect.gen(function* () {
              const timings = {
                voice: 'v',
                scenes: {
                  hand: { ...spokenTake('Hi.'), duration: durations[0] },
                  beta: { ...spokenTake('Hi.'), duration: durations[1] },
                },
              };
              const laid = Result.getOrThrow(layout(scenes, timings, at.fps));
              const built = laid[2]!;
              const keys = yield* stamps.scenes({ ...inMemoryFilm, timings }, laid);
              return {
                frames: laid.map((p) => p.frame),
                key: keys.beats.get('built'),
                clock: [0, at.half - 1, at.half, at.half + 1].map((k) =>
                  beatTime(built, secondsAt(built.frame + k, at.fps)),
                ),
              };
            });
          const was = yield* laidWith([3.6, 3.2]);
          const now = yield* laidWith([4.1, 2.7]);
          expect([was.frames, now.frames]).toEqual([at.was, at.now]);
          expect(now.key).toEqual(was.key);
          expect(now.clock).toEqual(was.clock);
          // The frame at its half second reads half a second in, the one before it less.
          expect(was.clock[1]).toBeLessThan(0.5);
          expect(was.clock[2]).toBeGreaterThanOrEqual(0.5);
        }
      }).pipe(Effect.provide(inMemory(0).layer)),
  );
});

describe.concurrent('importsOf', () => {
  test('lists imports and re-exports, each once', () => {
    const source = `import { a } from './a.ts';
import type { B } from '@manna/film/core';
export { c } from './c.ts';
export * from './a.ts';
const x = 1;
export { x };
`;
    expectPlain(importsOf('m.ts', source)).toEqual(['./a.ts', '@manna/film/core', './c.ts']);
  });
});
