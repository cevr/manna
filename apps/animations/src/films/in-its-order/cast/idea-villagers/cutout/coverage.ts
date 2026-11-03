import type { CoverageManifest } from '@manna/film/tools';

const FOR = [{ script: 'in-its-order', beats: ['milk', 'teeth', 'math', 'eat'] }];

export const COVERAGE: CoverageManifest = {
  member: 'idea-villagers',
  entries: [
    { id: 'poses-poses-3', cut: 'puppet', file: 'cast-sheet/views/poses-3.png', for: FOR },
    { id: 'poses-poses-4', cut: 'puppet', file: 'cast-sheet/views/poses-4.png', for: FOR },
    { id: 'poses-poses-6', cut: 'puppet', file: 'cast-sheet/views/poses-6.png', for: FOR },
    {
      id: 'single-single-15',
      cut: 'puppet',
      file: 'cast-sheet/views/single-15.png',
      for: [{ script: 'in-its-order', beats: ['milk'] }],
    },
  ],
};
