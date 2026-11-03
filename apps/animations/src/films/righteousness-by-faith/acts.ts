import type { Look } from '@manna/film/core';
import { GROUND, type Ground } from './palette.ts';

/**
 * An act's target at the film's ground level (`GROUND` in palette.ts). Each
 * level's bands are its lookbook measure, moved from `now` by what each act
 * rose, so the gaps between the acts hold at every level.
 */
const range = (by: Readonly<Record<Ground, readonly [number, number]>>) => by[GROUND];

/** The film's shape and colour script: its acts, in film order. */
export const look = {
  acts: [
    {
      from: 'cold',
      name: 'verdict',
      chapter: 'How can God call a guilty man righteous?',
      luma: range({ now: [140, 165], light: [155, 180], lighter: [165, 190] }),
      saturation: [0.25, 0.35],
    },
    {
      from: 'word',
      name: 'seed',
      chapter: "Is God's verdict a cover-up?",
      luma: range({ now: [135, 150], light: [155, 170], lighter: [165, 180] }),
      saturation: [0.2, 0.3],
    },
    {
      from: 'roof',
      name: 'gifts',
      chapter: "What does that look like in a real person's life?",
      luma: range({ now: [135, 150], light: [155, 170], lighter: [165, 180] }),
      saturation: range({ now: [0.2, 0.3], light: [0.2, 0.3], lighter: [0.15, 0.25] }),
    },
    {
      from: 'grain',
      name: 'grain',
      chapter: 'How can God forgive?',
      luma: range({ now: [90, 110], light: [106, 126], lighter: [115, 135] }),
      dark: 0.05,
    },
    {
      from: 'priest',
      name: 'still at work',
      chapter: "Does Jesus's work end at the cross?",
      luma: range({ now: [150, 160], light: [168, 178], lighter: [178, 188] }),
      saturation: range({ now: [0.25, 0.35], light: [0.25, 0.35], lighter: [0.2, 0.3] }),
    },
    {
      from: 'rain',
      name: 'harvest',
      chapter: 'Where is all this heading?',
      luma: range({ now: [150, 165], light: [169, 184], lighter: [180, 195] }),
      saturation: range({ now: [0.3, 0.4], light: [0.2, 0.3], lighter: [0.17, 0.27] }),
    },
  ],
} as const satisfies typeof Look.Encoded;

/** One of the film's acts, by name. */
export type ActName = (typeof look.acts)[number]['name'];
