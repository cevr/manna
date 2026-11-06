import type { StoryScene } from '../../../library/storybook/scene.ts';
import { COURTYARD, PARCHMENT } from './kit.ts';
import {
  coldBaby,
  coldLetter,
  coldOuch,
  coldSmile,
  coldTable,
  coldWhat,
  LETTER_QUOTE,
} from './shots/cold.ts';
import { BOOK_QUOTE, milkCup, milkPour, milkRow } from './shots/milk.ts';
import { TITLE_NAME, titleShot } from './shots/title.ts';

/**
 * The cold open in the courtyard: the mother and her baby, the table and
 * the bottle, the close two-shot of the smile, the letter, the lead's wince
 * and the cup and loaf. No card: Heb 5:12 is lettered over the dimmed table
 * in cold-letter as it is read (`LETTER_QUOTE`; the owner asked for the
 * quotes off black cards, journal.md).
 */
export const COLD_STORY: StoryScene = {
  scene: 'cold',
  light: COURTYARD,
  shots: [coldBaby, coldTable, coldSmile, coldLetter, coldOuch, coldWhat],
  cards: [],
  over: [LETTER_QUOTE],
};

/** The title: one shot over the courtyard, the film's name set over the sky. */
export const TITLE_STORY: StoryScene = {
  scene: 'title',
  light: COURTYARD,
  shots: [titleShot],
  cards: [],
  over: [TITLE_NAME],
};

/**
 * The milk on the parchment: the villager and the book, the pour and the
 * row drinking in turn. No card: 1 Pet 2:2 is lettered on the open book's
 * pages in milk-pour as it is read (`BOOK_QUOTE`), and the milk pours from
 * that book.
 */
export const MILK_STORY: StoryScene = {
  scene: 'milk',
  light: PARCHMENT,
  shots: [milkCup, milkPour, milkRow],
  cards: [],
  over: [BOOK_QUOTE],
};

/** Act 1's storybook scenes, each its shots, cards and light. */
export const STORIES: ReadonlyArray<StoryScene> = [COLD_STORY, TITLE_STORY, MILK_STORY];
