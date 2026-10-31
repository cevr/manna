import { describe, expect, test } from 'bun:test';
import type { PartCut } from '@manna/film/tools';
import { PUPPETS as LEAD } from '../cast/lead-feast/cutout/puppets.ts';
import { PUPPETS as SOWER } from '../cast/sower/cutout/puppets.ts';
import { PUPPETS as TODDLER } from '../cast/villager-toddler/cutout/puppets.ts';
import { type PuppetMember, puppetsOf } from './puppets.ts';

const ROOT = { bones: [], skin: {}, root: [0, 0] } as const;
const FRAME = { sheet: 'turnaround', kept: [0, 0, 10, 10], pad: [1, 1, 1, 1] } as const;

/** A member of one view, `front`, whose cut lists `parts` front to back. */
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
  test('names as his shadow each part his cut gives the shadow role, and no part the cut gives none, whatever it is called', () => {
    const { front } = puppetsOf(
      member([
        { name: 'body', take: [] },
        { name: 'shadow', take: [] },
        { name: 'pool', role: 'shadow', take: [] },
      ]),
    );
    expect(front.shadow).toEqual(['pool']);
  });

  test('names every part called shadow on each view of the members that cut one as his shadow', () => {
    for (const puppets of [LEAD, SOWER, TODDLER])
      for (const puppet of Object.values(puppets))
        for (const part of puppet.parts)
          if (part.name === 'shadow')
            expect([puppet.key, puppet.shadow]).toEqual([puppet.key, ['shadow']]);
  });
});
