// A fake member's stages, in a scratch folder: what each stage reads (its
// source files, a fitted pose's files) and which drawings get renders.
// Slow: `stages.ts` imports the parts command and the fit render.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Path } from 'effect';
import { ChildProcessSpawner } from 'effect/process';
import { PuppetImagesBun } from '../../puppet/images-bun.ts';
import { ContentStore } from '../content-store.ts';
import { Critic } from '../critique.ts';
import { FilmFolder } from '../film-repo.ts';
import { Pages } from '../pages.ts';
import { memoryLocks } from '../host/testing.ts';
import type { Coverage, EntryFacts } from './coverage.ts';
import { type Input, type Stage, buildGraph } from './graph.ts';
import { sourceFiles, stageSources } from './sources.ts';
import { clipStages, memberStages } from './stages.ts';

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
    return dir;
  });

const stagesOf = (dir: string, facts: Record<string, EntryFacts> = {}) =>
  memberStages({
    film: 'in-its-order' as never,
    member: 'fake',
    memberDir: dir,
    libraryPuppets: `${dir}/library-puppets.ts`,
    coverage: COVERAGE,
    facts,
  });

const filesOf = (stages: ReadonlyArray<Stage<unknown>>, id: string) =>
  stages
    .filter((s) => s.id === id)
    .flatMap((s) => s.inputs)
    .filter((i): i is Extract<Input, { _tag: 'File' }> => i._tag === 'File')
    .map((i) => i.path);

const allComplete = Object.fromEntries(COVERAGE.entries.map((e) => [e.id, complete]));

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
      expect(filesOf(stages, 'fit:poses-poses-1@fake')).toEqual(
        expect.arrayContaining(yield* sourceFiles('fit')),
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

  it.effect(
    'the parts stage calls no okra without --spend okra, and only its spend gate does',
    () => {
      const spawned: Array<string> = [];
      // every process the parts command could start, `okra image` first among them, is recorded and refused
      const spawner = ChildProcessSpawner.make((command) => {
        if (command._tag === 'StandardCommand') spawned.push(command.command);
        return Effect.die(`no process in this test: ${String(command)}`);
      });
      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* memberIn([]);
        yield* fs.makeDirectory(`${dir}/cast-sheet/views`, { recursive: true });
        yield* fs.writeFileString(`${dir}/cast-sheet/views/front.png`, 'png');
        const front = (yield* stagesOf(dir, allComplete)).filter((s) =>
          ['drawing:turnaround-front@fake', 'parts:turnaround-front@fake'].includes(s.id),
        );
        const options = { cache: `${dir}/cache`, plan: false, touch: [] };
        const held = yield* buildGraph(front, { ...options, spend: new Set() });
        expect(held.stages.map((s) => [s.id, s.state])).toEqual([
          ['drawing:turnaround-front@fake', 'ran'],
          ['parts:turnaround-front@fake', 'waiting-spend'],
        ]);
        expect(held.okraCalls).toBe(0);
        expect(spawned).toEqual([]);
        // granted, the stage's one way to okra is its spend gate (its member is no film's here, so the call fails)
        const granted = yield* buildGraph(front, { ...options, spend: new Set(['okra'] as const) });
        expect(granted.okraCalls).toBe(1);
        expect(granted.stages.find((s) => s.id === 'parts:turnaround-front@fake')?.state).toBe(
          'failed',
        );
      }).pipe(
        Effect.scoped,
        Effect.provide(
          Layer.mergeAll(
            ContentStore.layer.pipe(Layer.provide(memoryLocks)),
            FilmFolder.layer('/nonexistent/loop-probe-x/films'),
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
          ).pipe(Layer.provideMerge(BunServices.layer)),
        ),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      );
    },
  );

  it.effect('a clip eval reads the train, the training set and the chain, not every cut', () =>
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
            clips: [{ id: 'b', file: 'cutout/raise/clip/b.mp4', bands: [] }],
          },
          facts: allComplete,
        },
        '/cache',
        (yield* stageSources).chain,
      );
      const inputs = clips.flatMap((c) => c.inputs);
      expect(inputs).toContainEqual({ _tag: 'Stage', id: 'train' });
      expect(inputs).toContainEqual({ _tag: 'Stage', id: 'trainset' });
      expect(inputs.filter((i) => i._tag !== 'File' && i.id.startsWith('cut:'))).toEqual([]);
      expect(filesOf(clips, 'eval:clip:b@fake')).toEqual(
        expect.arrayContaining(yield* sourceFiles('chain')),
      );
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
