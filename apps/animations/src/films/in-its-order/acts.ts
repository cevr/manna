// The film's acts, declared once: each from its first scene, the short phrase
// from the narration that names its chapter (`film chapters`), and the light it should
// measure (CRAFT rule 11). An act runs from its scene until the next act's
// (`membersOf` in the film core). The tent poles (script.ts) are each act's
// one frame. The bands are the first targets, taken from RBF's measured acts
// at its `now` ground for the same lights; the film's lookbook measures them
// once its scenes are drawn. Imports nothing that touches the DOM.

import type { Look } from '@manna/film/core';

/** The film's shape and colour script: its acts, in film order. */
export const look = {
  acts: [
    {
      // The feast: the bright teal day of the courtyard.
      from: 'cold',
      name: 'feast',
      chapter: 'a bottle at the feast',
      luma: [150, 165],
      saturation: [0.3, 0.4],
    },
    {
      // The foundation: the parchment page in peach, with Corinth's short dusk.
      from: 'stones',
      name: 'foundation',
      chapter: 'the first principles',
      luma: [135, 150],
      saturation: [0.2, 0.3],
    },
    {
      // The sum: peach going to dawn on the slate.
      from: 'math',
      name: 'sum',
      chapter: 'the hardest sum',
      luma: [140, 155],
      saturation: [0.2, 0.3],
    },
    {
      // The meat: dawn gold behind the veil.
      from: 'priest',
      name: 'meat',
      chapter: 'more of him',
      luma: [150, 160],
      saturation: [0.25, 0.35],
    },
    {
      // Growing: the field's peach morning to the landing's teal and yellow.
      from: 'grain',
      name: 'growing',
      chapter: 'a place at the table',
      luma: [150, 165],
      saturation: [0.3, 0.4],
    },
  ],
} as const satisfies typeof Look.Encoded;

/** One of the film's acts, by name. */
export type ActName = (typeof look.acts)[number]['name'];
