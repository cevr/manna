// A fake member's stages, in a scratch folder: what each stage reads (its
// source files, a fitted pose's files) and which drawings get renders.
// Slow: `stages.ts` imports the parts command and the fit render.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path } from 'effect';
import type { Coverage, EntryFacts } from './coverage.ts';
import type { Input, Stage } from './graph.ts';
import { sourceFiles } from './sources.ts';
import { memberStages } from './stages.ts';

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
        expect.arrayContaining([...sourceFiles('renders')]),
      );
      expect(filesOf(stages, 'fit:poses-poses-1@fake')).toEqual(
        expect.arrayContaining([...sourceFiles('fit')]),
      );
      expect(filesOf(stages, 'parts:turnaround-front@fake')).toEqual(
        expect.arrayContaining([...sourceFiles('parts')]),
      );
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
