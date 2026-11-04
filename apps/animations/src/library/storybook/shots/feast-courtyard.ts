import { figure, hold, keyRun, type Shot, turn, walk } from '../shot.ts';

/** The set's plates, relative to apps/animations: test art until the concept step keeps real ones. */
const SET = 'src/library/storybook/set/feast-courtyard';

/** The keys of each member's feast-courtyard sheet, as drawn. */
const LEAD = ['side', 'threeQuarter', 'front', 'lift', 'offer', 'wave-1', 'wave-2'] as const;
const GUEST = ['neutral', 'smile', 'turn'] as const;

/** The guests' layer's depth: their heads read 0.92 of the lead's, as take 4 drew them. */
const GUESTS_Z = 1 / 0.92;

/**
 * The feast courtyard, take 4 ported: the lead walks in on his side with a
 * bob, turns to the viewer, greets the guests with a run of drawn keys, and
 * turns toward them; the guests smile, then turn. The camera pans 100 px
 * and pushes in 7 % over the shot.
 */
export const feastCourtyard: Shot = {
  id: 'feast-courtyard',
  size: { width: 1280, height: 720 },
  fps: 24,
  duration: 12,
  headPx: 147,
  light: {
    tint: { colour: '#ffd79a', amount: 0.1 },
    shade: { colour: '#5b4a8c', amount: 0.1 },
  },
  camera: [
    { t: 0, x: 590, y: 360, zoom: 1 },
    { t: 12, x: 690, y: 360, zoom: 1.07 },
  ],
  layers: [
    {
      name: 'set',
      z: 1 / 0.3,
      blur: 0,
      items: [
        {
          _tag: 'Plate',
          file: `${SET}/plate.png`,
          testArt: true,
          place: { x: -76.8, y: -195.7, width: 1433.6, height: 955.7 },
        },
      ],
    },
    {
      name: 'guests',
      z: GUESTS_Z,
      blur: 0,
      items: [
        figure(GUEST, {
          name: 'man',
          member: 'feast-guest-man',
          sheet: 'feast-courtyard',
          at: { x: 670, ground: 532 },
          spans: [
            keyRun([
              [0, 'neutral'],
              [4.6, 'smile'],
              [7.7, 'turn'],
            ]),
          ],
        }),
        figure(GUEST, {
          name: 'woman',
          member: 'feast-guest-woman',
          sheet: 'feast-courtyard',
          at: { x: 930, ground: 532 },
          spans: [
            keyRun([
              [0, 'neutral'],
              [5.1, 'smile'],
              [8.4, 'turn'],
            ]),
          ],
        }),
        {
          _tag: 'Plate',
          file: `${SET}/table.png`,
          testArt: true,
          place: { x: 470, y: 303.3, width: 620, height: 356.7 },
        },
      ],
    },
    {
      name: 'lead',
      z: 1,
      blur: 0,
      items: [
        figure(LEAD, {
          name: 'lead',
          member: 'lead-feast',
          sheet: 'feast-courtyard',
          at: { x: 320, ground: 690 },
          spans: [
            walk({ from: 0, to: 3, cell: 'side', x0: -140, x1: 320, bob: 5, rate: 2.6 }),
            turn(3.05, 0.34, 'side', 'threeQuarter'),
            turn(3.45, 0.34, 'threeQuarter', 'front'),
            keyRun([
              [3.9, 'front'],
              [4.1, 'lift'],
              [4.3, 'offer'],
              [4.5, 'wave-1'],
              [4.75, 'wave-2'],
              [5, 'wave-1'],
              [5.25, 'wave-2'],
              [5.5, 'wave-1'],
              [5.75, 'wave-2'],
              [6, 'wave-1'],
              [6.3, 'offer'],
              [6.5, 'lift'],
              [6.7, 'front'],
            ]),
            turn(7.3, 0.4, 'front', 'threeQuarter'),
            hold(7.7, 12, 'threeQuarter'),
          ],
        }),
      ],
    },
    {
      name: 'foreground',
      z: 2 / 3,
      blur: 3,
      items: [
        {
          _tag: 'Plate',
          file: `${SET}/fg.png`,
          testArt: true,
          place: { x: -128, y: -244, width: 1536, height: 1024 },
        },
      ],
    },
  ],
};
