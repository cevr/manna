// Every drawing the cast pipeline needs of the feast lead
// (`film concept coverage`): his four cut views, poses-1 fitted from his
// front, and his raise's keys. K2 and K3 split onto the upper arm and the
// forearm (0.8 % and 1.4 % of their pixels within both segments' sleeve
// half-width), so each is a puppet to cut; K4-K6 fold the forearm over the
// upper arm and stay drawn keys, shown whole on twos. His reader is scored
// on clip B (`clips`). Pure data.

import type { CoverageManifest } from '@manna/film/tools';

const BEATS = [
  {
    script: 'in-its-order',
    beats: ['cold', 'milk', 'bottle', 'teeth', 'name', 'appeal', 'thesis'],
  },
];
const RAISE = [{ script: 'in-its-order', beats: ['cold'] }];

export const COVERAGE: CoverageManifest = {
  member: 'lead-feast',
  entries: [
    { id: 'turnaround-front', cut: 'puppet', file: 'cast-sheet/views/front.png', for: BEATS },
    {
      id: 'turnaround-threeQuarterLeft',
      cut: 'puppet',
      file: 'cast-sheet/views/threeQuarterLeft.png',
      for: BEATS,
    },
    { id: 'heads-heads-4', cut: 'puppet', file: 'cast-sheet/views/heads-4.png', for: BEATS },
    { id: 'single-single-1', cut: 'puppet', file: 'cast-sheet/views/single-1.png', for: BEATS },
    {
      id: 'poses-poses-1',
      cut: 'puppet',
      fitted: 'turnaround-front',
      file: 'cast-sheet/views/poses-1.png',
      for: RAISE,
    },
    {
      id: 'raise/k2',
      cut: 'puppet',
      family: 'raise',
      between: ['raise/rest', 'raise/k3'],
      file: 'cutout/raise/keys/k2.png',
      for: RAISE,
    },
    {
      id: 'raise/k3',
      cut: 'puppet',
      family: 'raise',
      between: ['raise/k2', 'raise/k4'],
      file: 'cutout/raise/keys/k3.png',
      for: RAISE,
    },
    {
      id: 'raise/k4',
      cut: 'key',
      family: 'raise',
      between: ['raise/k3', 'raise/k5'],
      file: 'cutout/raise/keys/k4.png',
      for: RAISE,
      why: 'folds the forearm: elbow 66.3 deg, 5.6 % of its pixels within both segments (bar 5 %)',
    },
    {
      id: 'raise/k5',
      cut: 'key',
      family: 'raise',
      between: ['raise/k4', 'raise/k6'],
      file: 'cutout/raise/keys/k5.png',
      for: RAISE,
      why: 'folds the forearm: elbow 28.4 deg, 24.0 % of its pixels within both segments (bar 5 %)',
    },
    {
      id: 'raise/k6',
      cut: 'key',
      family: 'raise',
      between: ['raise/k5', 'poses-poses-1'],
      file: 'cutout/raise/keys/k6.png',
      for: RAISE,
      why: 'folds the forearm: elbow 1.9 deg, 63.3 % of its pixels within both segments (bar 5 %)',
    },
  ],
  // clip B (fal, first frame only): he stands at the front to f40 and holds the bottle raised from f41
  clips: [
    {
      id: 'raise/clip-b',
      file: 'cutout/raise/clip/clip-b.mp4',
      bands: [
        [0, 40],
        [41, 123],
      ],
    },
  ],
};
