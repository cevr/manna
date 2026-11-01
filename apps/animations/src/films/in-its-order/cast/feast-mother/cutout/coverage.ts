// Every drawing the cast pipeline needs of the feast mother (`film concept
// coverage`): her six turnaround views and her three poses, each cut. Pure data.

import type { CoverageManifest } from '@manna/film/tools';

const FOR = [{ script: 'in-its-order', beats: ['cold'] }];
/** The house prompt's opening and close, as clip B's (`lead-feast` `raise/clip-b`). */
const PAPER = 'Flat 2D cut-paper cartoon animation on a static paper background.';
const CAMERA =
  'Locked camera, no zoom, no pan, same flat colours and thick dark outline throughout.';

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
  // fal motion references from her kept poses; each band is the clip's still start, then its still end
  clips: [
    {
      id: 'wave/clip-a',
      file: 'cutout/wave/clip/clip-a.mp4',
      bands: [
        [0, 11],
        [100, 123],
      ],
      expect: [['turnaround-front'], ['turnaround-front']],
      given: { first: 'turnaround-front' },
      prompt: `${PAPER} The woman stands still and slowly raises her right hand (on the left side of the picture), open, from her side up to shoulder height, then holds the pose. Only the arm moves; body, feet and head stay in place. ${CAMERA}`,
      seed: 7,
    },
    {
      id: 'cup/clip-a',
      file: 'cutout/cup/clip/clip-a.mp4',
      bands: [
        [0, 11],
        [100, 123],
      ],
      expect: [['poses-poses-1'], ['poses-poses-1']],
      given: { first: 'poses-poses-1' },
      prompt: `${PAPER} The woman holding the baby stands still and slowly lowers the small cup in her left hand (on the right side of the picture) from the baby's mouth down to her side, then holds the pose. Only the arm with the cup moves; body, baby, feet and head stay in place. ${CAMERA}`,
      seed: 7,
    },
  ],
};
