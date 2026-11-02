// Every drawing the cast pipeline needs of the filler bases (`film concept
// coverage`): their four views at rest, each cut as a bust puppet for a
// crowd. Pure data.

import type { CoverageManifest } from '@manna/film/tools';

const FOR = [{ script: 'in-its-order', beats: ['cold'] }];

export const COVERAGE: CoverageManifest = {
  member: 'filler-bases',
  entries: [
    { id: 'poses-poses-1', cut: 'puppet', file: 'cast-sheet/views/poses-1.png', for: FOR },
    { id: 'poses-poses-2', cut: 'puppet', file: 'cast-sheet/views/poses-2.png', for: FOR },
    { id: 'poses-poses-3', cut: 'puppet', file: 'cast-sheet/views/poses-3.png', for: FOR },
    { id: 'poses-poses-4', cut: 'puppet', file: 'cast-sheet/views/poses-4.png', for: FOR },
  ],
};
