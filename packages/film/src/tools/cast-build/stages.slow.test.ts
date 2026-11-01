// A fake member's stages, in a scratch folder: what each stage reads (its
// source files, a fitted pose's files) and which drawings get renders.
// Slow: `stages.ts` imports the parts command and the fit render.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Option, Path, Sink, Stream } from 'effect';
import { ChildProcessSpawner } from 'effect/process';
import { PuppetImagesBun } from '../../puppet/images-bun.ts';
import { ContentStore } from '../content-store.ts';
import { Critic } from '../critique.ts';
import { FilmFolder } from '../film-repo.ts';
import { Pages } from '../pages.ts';
import { memoryLocks } from '../host/testing.ts';
import type { Coverage, EntryFacts } from './coverage.ts';
import { type Input, type Stage, buildGraph } from './graph.ts';
import { RENDER_PAGE } from '../../../../../apps/animations/server.ts';
import { stageSources } from './sources.ts';
import { buildSources, clipStages, memberStages } from './stages.ts';

/** A stage kind's source files, as `stageSources` makes them its inputs. */
const sourceFiles = (kind: keyof Effect.Success<typeof stageSources>) =>
  Effect.map(stageSources, (all) =>
    all[kind].flatMap((i) => {
      if (i._tag === 'File') return [i.path];
      return [];
    }),
  );

const COVERAGE: Coverage = {
  member: 'fake',
  entries: [
    { id: 'turnaround-front', cut: 'puppet', file: 'cast-sheet/views/front.png', for: [] },
    {
      id: 'turnaround-threeQuarterLeft',
      cut: 'puppet',
      file: 'cast-sheet/views/threeQuarterLeft.png',
      for: [],
    },
    {
      id: 'poses-poses-1',
      cut: 'puppet',
      fitted: 'turnaround-front',
      file: 'cast-sheet/views/poses-1.png',
      for: [],
    },
  ],
};

const complete: EntryFacts = { drawn: true, kept: true, cut: true, bars: true, fit: true };

/** A member folder: his poses module and the files it imports, and a recorded sheet for each view in `recorded`. */
const memberIn = (recorded: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped();
    const write = (file: string, text: string) =>
      Effect.gen(function* () {
        yield* fs.makeDirectory(path.dirname(path.join(dir, file)), { recursive: true });
        yield* fs.writeFileString(path.join(dir, file), text);
      });
    yield* write(
      'cutout/poses.ts',
      [
        "import held from './raise/held/poses-1.png' with { type: 'file' };",
        "import POSES1 from './poses/poses-poses-1.json' with { type: 'json' };",
        "import { PUPPETS } from './puppets.ts';",
      ].join('\n'),
    );
    yield* write('cutout/poses/poses-poses-1.json', '{}');
    yield* write('cutout/raise/held/poses-1.png', 'png');
    yield* write('cutout/puppets.ts', 'export const PUPPETS = {};');
    for (const view of recorded) yield* write(`cutout/sheets/${view}/record.json`, '{}');
    // the film's cast module, which the fit render loads by its path, and a file it imports
    yield* write(
      'films/in-its-order/rigs/cast.ts',
      "import { TABLE } from './table.ts';\nexport const CAST = TABLE;",
    );
    yield* write('films/in-its-order/rigs/table.ts', 'export const TABLE = {};');
    return dir;
  });

const stagesOf = (dir: string, facts: Record<string, EntryFacts> = {}) =>
  Effect.flatMap(buildSources('in-its-order' as never, RENDER_PAGE), (src) =>
    memberStages(
      {
        film: 'in-its-order' as never,
        member: 'fake',
        memberDir: dir,
        libraryPuppets: `${dir}/library-puppets.ts`,
        coverage: COVERAGE,
        facts,
      },
      src,
    ),
  ).pipe(Effect.provide(FilmFolder.layer(`${dir}/films`)));

/** Each file from the packages folder: `film/src/...`. */
const ends = (files: ReadonlyArray<string>) => files.map((f) => f.split('/packages/').at(-1));

const filesOf = (stages: ReadonlyArray<Stage<unknown>>, id: string) =>
  stages
    .filter((s) => s.id === id)
    .flatMap((s) => s.inputs)
    .filter((i): i is Extract<Input, { _tag: 'File' }> => i._tag === 'File')
    .map((i) => i.path);

const allComplete = Object.fromEntries(COVERAGE.entries.map((e) => [e.id, complete]));

/** The series lead, whose front's part sheet is kept with its okra answers. */
const LEAD_FEAST = `${import.meta.dir}/../../../../../apps/animations/src/library/cast/lead-feast`;

/** The front's kept okra answer: what the fake `okra image` below draws. */
const ANSWER = `${LEAD_FEAST}/cutout/sheets/front/okra/answer-1.png`;

const FRONT: Coverage['entries'][number] = {
  id: 'turnaround-front',
  cut: 'puppet',
  file: 'cast-sheet/views/front.png',
  for: [],
};
const PARTS = 'parts:turnaround-front@lead-feast';

/**
 * The lead as the film's own cast member, in a scratch films folder: his
 * sheet and cutout code linked to the library's, his front's part sheet a
 * copy the parts command may write.
 */
const leadFeastIn = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  const films = path.join(root, 'films');
  const member = path.join(films, 'in-its-order', 'cast', 'lead-feast');
  const sheet = path.join(member, 'cutout', 'sheets', 'front');
  yield* fs.makeDirectory(path.join(films, 'in-its-order', 'scenes'), { recursive: true });
  yield* fs.writeFileString(path.join(films, 'in-its-order', 'scenes', 'index.ts'), 'export {};\n');
  // the film's cast module, which the fit stage's key reads; a stand-in, as no fit runs here
  yield* fs.makeDirectory(path.join(films, 'in-its-order', 'rigs'));
  yield* fs.writeFileString(path.join(films, 'in-its-order', 'rigs', 'cast.ts'), 'export {};\n');
  yield* fs.makeDirectory(path.join(member, 'cutout', 'sheets'), { recursive: true });
  for (const name of ['cast-sheet', 'rig'])
    yield* fs.symlink(path.join(LEAD_FEAST, name), path.join(member, name));
  for (const name of yield* fs.readDirectory(path.join(LEAD_FEAST, 'cutout')))
    if (name !== 'sheets')
      yield* fs.symlink(path.join(LEAD_FEAST, 'cutout', name), path.join(member, 'cutout', name));
  yield* fs.copy(path.join(LEAD_FEAST, 'cutout', 'sheets', 'front'), sheet);
  return { films, member, sheet, cache: path.join(root, 'cache') };
});

/**
 * `okra image` answering from the kept answer: each process asked for is
 * recorded (program and arguments); okra's copies the answer to its `-o`
 * path and exits 0, any other dies.
 */
const okraAnswering = (fs: FileSystem.FileSystem, spawned: Array<ReadonlyArray<string>>) =>
  ChildProcessSpawner.make((command) => {
    if (command._tag !== 'StandardCommand') return Effect.die('no piped process in this test');
    spawned.push([command.command, ...command.args]);
    if (command.command !== 'okra') return Effect.die(`no ${command.command} in this test`);
    const out = command.args[command.args.indexOf('-o') + 1] ?? '/nonexistent/loop-probe-x';
    return fs.copyFile(ANSWER, out).pipe(
      Effect.orDie,
      Effect.as(
        ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(0),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
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
    );
  });

type Scratch = Effect.Success<typeof leadFeastIn>;

/** What the parts stage builds on beside its films folder and processes: no page and no critique. */
const partsLayer = Layer.mergeAll(
  ContentStore.layer.pipe(Layer.provide(memoryLocks)),
  PuppetImagesBun,
  Layer.succeed(Pages, Pages.of({ open: () => Effect.die('no page in this test') })),
  Layer.succeed(
    Critic,
    Critic.of({
      critique: () => Effect.die('no critique in this test'),
      start: () => Effect.die('no critique in this test'),
      job: () => Effect.die('no critique in this test'),
      critiqueSheet: () => Effect.die('no critique in this test'),
    }),
  ),
).pipe(Layer.provideMerge(BunServices.layer));

/** The timeout of a parts case: laying a part sheet again took 5.6 s at a load of 43, past bun's 5 s. */
const PARTS_MS = 20_000;

/** A time no build writes a part at: 2000-01-01, in seconds as `utimes` reads a number. */
const LONG_AGO = 946_684_800;

/**
 * `body` over the lead in a scratch films folder: `run` builds his front's
 * drawing and parts under a spend setting and answers the parts stage's
 * state and the okra calls the build counted; `spawned` holds every process
 * asked for.
 */
const partsOver = <E>(
  body: (over: {
    readonly at: Scratch;
    readonly run: (spend: ReadonlySet<'okra'>) => Effect.Effect<{ parts?: string; okra: number }>;
    readonly spawned: ReadonlyArray<ReadonlyArray<string>>;
  }) => Effect.Effect<void, E, FileSystem.FileSystem>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const at = yield* leadFeastIn;
    const spawned: Array<ReadonlyArray<string>> = [];
    const services = Layer.merge(
      FilmFolder.layer(at.films),
      Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, okraAnswering(fs, spawned)),
    );
    const context = yield* Effect.context<Layer.Success<typeof partsLayer>>();
    const run = (spend: ReadonlySet<'okra'>) =>
      Effect.gen(function* () {
        const stages = (yield* memberStages(
          {
            film: 'in-its-order' as never,
            member: 'lead-feast',
            memberDir: at.member,
            libraryPuppets: `${at.member}/library-puppets.ts`,
            coverage: { member: 'lead-feast', entries: [FRONT] },
            facts: { [FRONT.id]: complete },
          },
          yield* buildSources('in-its-order' as never, RENDER_PAGE),
        )).filter((s) => [`drawing:${FRONT.id}@lead-feast`, PARTS].includes(s.id));
        const report = yield* buildGraph(stages, {
          // the member lies in a scratch folder and the stage sources in the repo
          root: '/',
          cache: at.cache,
          plan: false,
          touch: [],
          spend,
        });
        return {
          parts: report.stages.find((s) => s.id === PARTS)?.state,
          okra: report.okraCalls,
        };
      }).pipe(Effect.provide(services), Effect.provide(context), Effect.orDie);
    yield* body({ at, run, spawned });
  }).pipe(Effect.scoped, Effect.provide(partsLayer));

describe('memberStages', () => {
  it.effect('a fitted entry’s fit reads its fitted pose and held drawing', () =>
    Effect.gen(function* () {
      const dir = yield* memberIn(['front', 'threeQuarterLeft']);
      const stages = yield* stagesOf(dir, allComplete);
      const fit = filesOf(stages, 'fit:poses-poses-1@fake');
      expect(fit).toEqual(
        expect.arrayContaining([
          `${dir}/cutout/poses/poses-poses-1.json`,
          `${dir}/cutout/raise/held/poses-1.png`,
        ]),
      );
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('renders, fit and the parts read the source files whose code makes them', () =>
    Effect.gen(function* () {
      const dir = yield* memberIn(['front', 'threeQuarterLeft']);
      const stages = yield* stagesOf(dir, allComplete);
      expect(filesOf(stages, 'renders:turnaround-front@fake')).toEqual(
        expect.arrayContaining(yield* sourceFiles('renders')),
      );
      // the fit runs the render, the page it draws in and the film's cast module, loaded by its path
      expect(ends(filesOf(stages, 'fit:poses-poses-1@fake'))).toEqual(
        expect.arrayContaining([
          'film/src/tools/cast-render.ts',
          'film/src/player/cast.ts',
          'film/src/core/unmatte.ts',
        ]),
      );
      expect(filesOf(stages, 'fit:poses-poses-1@fake')).toEqual(
        expect.arrayContaining([
          `${dir}/films/in-its-order/rigs/cast.ts`,
          `${dir}/films/in-its-order/rigs/table.ts`,
        ]),
      );
      expect(filesOf(stages, 'parts:turnaround-front@fake')).toEqual(
        expect.arrayContaining(yield* sourceFiles('parts')),
      );
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('an entry with no sheet yet has its renders listed, held on its cut', () =>
    Effect.gen(function* () {
      const dir = yield* memberIn(['front']);
      const stages = yield* stagesOf(dir, allComplete);
      const renders = stages.filter((s) => s.id.startsWith('renders:')).map((s) => s.id);
      expect(renders).toEqual([
        'renders:turnaround-front@fake',
        'renders:turnaround-threeQuarterLeft@fake',
      ]);
      expect(
        stages.find((s) => s.id === 'renders:turnaround-threeQuarterLeft@fake')?.inputs,
      ).toContainEqual({ _tag: 'Stage', id: 'cut:turnaround-threeQuarterLeft@fake' });
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  describe('the parts stage, on the lead with okra answering from his kept answer', () => {
    it.effect(
      'the sheet holds its answers: it checks, spending nothing',
      () =>
        partsOver(({ at, run, spawned }) =>
          Effect.gen(function* () {
            // `--check` writes nothing; `--reuse` lays every part again: the parts keep the time set here only under `--check`.
            const fs = yield* FileSystem.FileSystem;
            const parts = (yield* fs.readDirectory(at.sheet)).filter((f) => f.endsWith('.png'));
            expect(parts).toContain('head.png');
            for (const part of parts) yield* fs.utimes(`${at.sheet}/${part}`, LONG_AGO, LONG_AGO);
            expect(yield* run(new Set())).toEqual({ parts: 'ran', okra: 0 });
            const times = yield* Effect.forEach(parts, (part) =>
              Effect.map(fs.stat(`${at.sheet}/${part}`), (info) =>
                Option.map(info.mtime, (t) => t.getTime()),
              ),
            );
            expect(times).toEqual(parts.map(() => Option.some(LONG_AGO * 1000)));
            expect(spawned).toEqual([]);
          }),
        ),
      // oxlint-disable-next-line film/tests-keep-their-strength -- the parts stage lays a real part sheet in this process (image decode and composite): 5.6 s at a load of 43, past bun's 5 s; a slow test may wait.
      PARTS_MS,
    );

    it.effect(
      'a part lost is laid again from the answers drawn, spending nothing',
      () =>
        partsOver(({ at, run, spawned }) =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            yield* fs.remove(`${at.sheet}/head.png`);
            expect(yield* run(new Set())).toEqual({ parts: 'ran', okra: 0 });
            expect(yield* fs.exists(`${at.sheet}/head.png`)).toBe(true);
            expect(spawned).toEqual([]);
          }),
        ),
      // oxlint-disable-next-line film/tests-keep-their-strength -- the parts stage lays a real part sheet in this process (image decode and composite): 5.6 s at a load of 43, past bun's 5 s; a slow test may wait.
      PARTS_MS,
    );

    it.effect(
      'no answer drawn: it waits on --spend okra, and calls okra once given it',
      () =>
        partsOver(({ at, run, spawned }) =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            for (const file of ['okra/answer-1.png', 'okra/answer-2.png', 'okra/calls.json'])
              yield* fs.remove(`${at.sheet}/${file}`);
            expect(yield* run(new Set())).toEqual({ parts: 'waiting-spend', okra: 0 });
            expect(spawned).toEqual([]);
            expect(yield* run(new Set(['okra'] as const))).toEqual({ parts: 'ran', okra: 1 });
            expect(spawned.map((c) => c.slice(0, 2))).toEqual([['okra', 'image']]);
            expect(spawned[0]).not.toContain('--model');
            expect(yield* fs.exists(`${at.sheet}/okra/answer-1.png`)).toBe(true);
          }),
        ),
      // oxlint-disable-next-line film/tests-keep-their-strength -- the parts stage lays a real part sheet in this process (image decode and composite): 5.6 s at a load of 43, past bun's 5 s; a slow test may wait.
      PARTS_MS,
    );
  });

  it.effect(
    'a clip eval reads the train, the clip made, its provenance, the training set and the chain, not every cut',
    () =>
      Effect.gen(function* () {
        const dir = yield* memberIn(['front']);
        const clips = clipStages(
          {
            film: 'in-its-order' as never,
            member: 'fake',
            memberDir: dir,
            libraryPuppets: `${dir}/library-puppets.ts`,
            coverage: {
              ...COVERAGE,
              clips: [
                {
                  id: 'b',
                  file: 'cutout/raise/clip/b.mp4',
                  bands: [],
                  expect: [],
                  given: { first: 'turnaround-front' },
                  prompt: 'p',
                  seed: 7,
                },
              ],
            },
            facts: allComplete,
          },
          '/cache',
          (yield* stageSources).chain,
        );
        const inputs = clips.flatMap((c) => c.inputs);
        expect(inputs).toContainEqual({ _tag: 'Stage', id: 'train' });
        expect(inputs).toContainEqual({ _tag: 'Stage', id: 'trainset' });
        // the mp4 is the clip-make stage's output; its map is the provenance beside it
        expect(inputs).toContainEqual({ _tag: 'Stage', id: 'clip:b@fake' });
        expect(inputs).toContainEqual({ _tag: 'File', path: `${dir}/cutout/raise/clip/b.json` });
        expect(inputs).not.toContainEqual({ _tag: 'File', path: `${dir}/cutout/raise/clip/b.mp4` });
        expect(inputs.filter((i) => i._tag !== 'File' && i.id.startsWith('cut:'))).toEqual([]);
        expect(filesOf(clips, 'eval:clip:b@fake')).toEqual(
          expect.arrayContaining(yield* sourceFiles('chain')),
        );
        // the decode and the map are the chain's code too
        expect(yield* sourceFiles('chain')).toContainEqual(
          expect.stringMatching(/\/cast-build\/clip-eval\.ts$/),
        );
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
