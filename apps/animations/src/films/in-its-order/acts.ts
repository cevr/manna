import type { Look } from '@manna/film/core';

export const look = {
  acts: [
    {
      from: 'cold',
      name: 'feast',
      chapter: 'a bottle at the feast',
      luma: [150, 165],
      saturation: [0.3, 0.4],
    },
    {
      from: 'stones',
      name: 'foundation',
      chapter: 'the first principles',
      luma: [135, 150],
      saturation: [0.2, 0.3],
    },
    {
      from: 'math',
      name: 'sum',
      chapter: 'the hardest sum',
      luma: [140, 155],
      saturation: [0.2, 0.3],
    },
    {
      from: 'priest',
      name: 'meat',
      chapter: 'more of him',
      luma: [150, 160],
      saturation: [0.25, 0.35],
    },
    {
      from: 'grain',
      name: 'growing',
      chapter: 'a place at the table',
      luma: [150, 165],
      saturation: [0.3, 0.4],
    },
  ],
} as const satisfies typeof Look.Encoded;

export type ActName = (typeof look.acts)[number]['name'];
