import type { PartCut } from '@manna/film/tools';
import { Glob } from 'bun';
import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { type CutPuppet, type PuppetMember, puppetsOf } from './puppets.ts';

const SRC = `${import.meta.dir}/../..`;

const MEMBERS = [
  ...new Glob('library/cast/*/cutout/puppets.ts').scanSync(SRC),
  ...new Glob('films/*/cast/*/cutout/puppets.ts').scanSync(SRC),
].toSorted();

interface PuppetsModule {
  readonly PUPPETS: Readonly<Record<string, CutPuppet>>;
}

const ROOT = { bones: [], skin: {}, root: [0, 0] } as const;
const FRAME = { sheet: 'turnaround', kept: [0, 0, 10, 10], pad: [1, 1, 1, 1] } as const;

const member = (parts: PartCut['parts']): PuppetMember<'front'> => ({
  cast: 'probe',
  frames: { front: FRAME },
  skeletons: { front: ROOT },
  papers: { front: [250, 240, 220] },
  line: { width: 9, ink: [30, 20, 10] },
  parts: { front: parts.map((p) => [p.name, `${p.name}.png`] as const) },
  cuts: { front: { parts } },
});

describe('a cut view puppet', () => {
  it.effect(
    'names as his shadow each part his cut gives the shadow role, and no part the cut gives none, whatever it is called',
    () =>
      Effect.sync(() => {
        const { front } = puppetsOf(
          member([
            { name: 'body', take: [] },
            { name: 'shadow', take: [] },
            { name: 'pool', role: 'shadow', take: [] },
          ]),
        );
        expect(front.shadow).toEqual(['pool']);
      }),
  );

  it.effect(
    'names every part called shadow on each view of every member as his shadow, so his cut gives it the shadow role',
    () =>
      Effect.gen(function* () {
        expect(MEMBERS.length).toBeGreaterThanOrEqual(8);
        const all = yield* Effect.forEach(MEMBERS, (file) =>
          Effect.promise((): Promise<PuppetsModule> => import(`${SRC}/${file}`)),
        );
        for (const { PUPPETS } of all)
          for (const puppet of Object.values(PUPPETS))
            for (const part of puppet.parts)
              if (part.name === 'shadow')
                expect([puppet.key, puppet.shadow]).toEqual([puppet.key, ['shadow']]);
      }),
  );
});
