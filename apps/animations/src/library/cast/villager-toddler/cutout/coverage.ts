import type { CoverageManifest } from '@manna/film/tools';

const FOR = [{ script: 'in-its-order', beats: ['milk', 'rush'] }];

export const COVERAGE: CoverageManifest = {
  member: 'villager-toddler',
  entries: [
    { id: 'poses-poses-1', cut: 'puppet', file: 'cast-sheet/views/poses-1.png', for: FOR },
    { id: 'poses-poses-2', cut: 'puppet', file: 'cast-sheet/views/poses-2.png', for: FOR },
  ],
};
