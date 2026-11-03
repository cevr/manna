import { type Author, type Credit, creditRoll } from '@manna/film/canvas';
import { soundCredits } from '@manna/film/core';
import { library } from '../../../../sounds/library.ts';
import { TITLE, script } from './script.ts';
import { sound } from './sound.ts';

const AUTHORS: ReadonlyArray<Author> = [
  { name: 'Ellen G. White' },
  { name: 'E. J. Waggoner' },
  { name: 'A. T. Jones' },
  {
    name: 'Fundamental Principles of the Seventh-day Adventists',
    citedAs: 'Fundamental Principles',
  },
];

export const CREDITS: ReadonlyArray<Credit> = creditRoll(
  TITLE,
  script.flatMap((b) => b.cite ?? []),
  AUTHORS,
  soundCredits(library, sound),
);
