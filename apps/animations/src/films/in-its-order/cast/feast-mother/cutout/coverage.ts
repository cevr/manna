// Every drawing the cast pipeline needs of the feast mother (`film concept
// coverage`): her six turnaround views and her three poses, each cut. Pure data.

import type { CoverageManifest } from '@manna/film/tools';

const FOR = [{ script: 'in-its-order', beats: ['cold'] }];

export const COVERAGE: CoverageManifest = {
  member: 'feast-mother',
  entries: [
    { id: 'turnaround-front', cut: 'puppet', file: 'cast-sheet/views/front.png', for: FOR },
    {
      id: 'turnaround-threeQuarterLeft',
      cut: 'puppet',
      file: 'cast-sheet/views/threeQuarterLeft.png',
      for: FOR,
    },
    { id: 'turnaround-back', cut: 'puppet', file: 'cast-sheet/views/back.png', for: FOR },
    {
      id: 'turnaround-profileLeft',
      cut: 'puppet',
      file: 'cast-sheet/views/profileLeft.png',
      for: FOR,
    },
    {
      id: 'turnaround-profileRight',
      cut: 'puppet',
      file: 'cast-sheet/views/profileRight.png',
      for: FOR,
    },
    {
      id: 'turnaround-threeQuarterRight',
      cut: 'puppet',
      file: 'cast-sheet/views/threeQuarterRight.png',
      for: FOR,
    },
    { id: 'poses-poses-1', cut: 'puppet', file: 'cast-sheet/views/poses-1.png', for: FOR },
    { id: 'poses-poses-2', cut: 'puppet', file: 'cast-sheet/views/poses-2.png', for: FOR },
    { id: 'poses-poses-3', cut: 'puppet', file: 'cast-sheet/views/poses-3.png', for: FOR },
  ],
};
