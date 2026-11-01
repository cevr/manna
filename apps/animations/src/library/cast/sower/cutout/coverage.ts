// Every drawing the cast pipeline needs of the sower (`film concept
// coverage`): his six turnaround views and his four poses, each cut. Pure data.

import type { CoverageManifest } from '@manna/film/tools';

const FOR = [{ script: 'in-its-order', beats: ['grain'] }];
/** The house prompt's opening and close, as clip B's (`lead-feast` `raise/clip-b`). */
const PAPER = 'Flat 2D cut-paper cartoon animation on a static paper background.';
const CAMERA =
  'Locked camera, no zoom, no pan, same flat colours and thick dark outline throughout.';

export const COVERAGE: CoverageManifest = {
  member: 'sower',
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
    { id: 'poses-poses-4', cut: 'puppet', file: 'cast-sheet/views/poses-4.png', for: FOR },
  ],
  // fal motion references between his kept poses; each band is the clip's still start, then its still end
  clips: [
    {
      id: 'sow/clip-a',
      file: 'cutout/sow/clip/clip-a.mp4',
      bands: [
        [0, 2],
        [110, 123],
      ],
      expect: [['poses-poses-3'], ['poses-poses-1']],
      given: { first: 'poses-poses-3', last: 'poses-poses-1' },
      prompt: `${PAPER} The sower stands still and slowly draws his right hand (on the left side of the picture) out of the seed bag at his hip and swings the arm out wide to the left of the picture, scattering small pale seeds, ending exactly in the pose of the last frame, then holds the pose. Only the arm moves; body, feet and head stay in place. ${CAMERA}`,
      seed: 7,
    },
    {
      id: 'dip/clip-a',
      file: 'cutout/dip/clip/clip-a.mp4',
      bands: [
        [0, 23],
        [34, 123],
      ],
      expect: [['turnaround-threeQuarterLeft'], ['poses-poses-3']],
      given: { first: 'turnaround-threeQuarterLeft' },
      prompt: `${PAPER} The sower stands still and slowly reaches his right hand (on the left side of the picture) across his body into the seed bag at his left hip, then holds the pose with the hand in the bag. Only the arm moves; body, feet and head stay in place. ${CAMERA}`,
      seed: 7,
    },
    {
      id: 'wave/clip-a',
      file: 'cutout/wave/clip/clip-a.mp4',
      bands: [
        [0, 19],
        [38, 123],
      ],
      expect: [
        ['turnaround-front', 'poses-poses-4'],
        ['turnaround-front', 'poses-poses-4'],
      ],
      given: { first: 'turnaround-front' },
      prompt: `${PAPER} The sower stands still and slowly raises his right hand (on the left side of the picture), open, from his side up to shoulder height, then holds the pose. Only the arm moves; body, feet and head stay in place. ${CAMERA}`,
      seed: 7,
    },
  ],
};
