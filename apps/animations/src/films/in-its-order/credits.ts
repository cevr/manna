import { type Author, type Credit, creditRoll } from '@manna/film/canvas';
import { TITLE, script } from './script.ts';

const AUTHORS: ReadonlyArray<Author> = [{ name: 'E. J. Waggoner' }, { name: 'Ellen G. White' }];

export const CREDITS: ReadonlyArray<Credit> = creditRoll(
  TITLE,
  script.flatMap((b) => b.cite ?? []),
  AUTHORS,
);
