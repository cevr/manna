import type { Look } from '@manna/film/core';
import { GROUND, type Ground } from '../palette.ts';

const range = (by: Readonly<Record<Ground, readonly [number, number]>>) => by[GROUND];

export const look = {
  acts: [
    {
      from: 'cold',
      name: 'cold open',
      chapter: 'How should man be just with God?',
      luma: range({ now: [140, 165], light: [155, 180], lighter: [165, 190] }),
      saturation: [0.15, 0.25],
    },
    {
      from: 'message',
      name: 'message',
      chapter: 'So how does anyone become righteous?',
      luma: range({ now: [135, 150], light: [155, 170], lighter: [165, 180] }),
      saturation: range({ now: [0.2, 0.3], light: [0.2, 0.3], lighter: [0.15, 0.25] }),
    },
    {
      from: 'spoke',
      name: 'faith',
      chapter: 'Where does faith come from?',
      luma: range({ now: [135, 150], light: [155, 170], lighter: [165, 180] }),
      saturation: [0.2, 0.3],
    },
    {
      from: 'declared',
      name: 'forgiveness',
      chapter: "Isn't that a cover-up?",
      luma: range({ now: [90, 110], light: [106, 126], lighter: [115, 135] }),
      dark: 0.05,
    },
    {
      from: 'within',
      name: 'power',
      chapter: 'So is the law out of the picture?',
      luma: range({ now: [150, 160], light: [168, 178], lighter: [178, 188] }),
      saturation: range({ now: [0.25, 0.35], light: [0.25, 0.35], lighter: [0.2, 0.3] }),
    },
    {
      from: 'rain',
      name: 'landing',
      chapter: 'Where was all this heading?',
      luma: range({ now: [150, 165], light: [169, 184], lighter: [180, 195] }),
      saturation: range({ now: [0.3, 0.4], light: [0.2, 0.3], lighter: [0.17, 0.27] }),
    },
  ],
} as const satisfies typeof Look.Encoded;

export type ActName = (typeof look.acts)[number]['name'];
