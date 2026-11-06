import type { StoryScene } from '../../../library/storybook/scene.ts';
import { COURTYARD, PARCHMENT } from './kit.ts';
import {
  coldAsk,
  coldBaby,
  coldLetter,
  coldOuch,
  coldScroll,
  coldSmile,
  coldTable,
  coldWhat,
  LETTER_QUOTE,
} from './shots/cold.ts';
import { BOOK_QUOTE, milkBook, milkCup, milkPour, milkRow, POUR_STREAM } from './shots/milk.ts';
import { TITLE_NAME, titleShot } from './shots/title.ts';

/**
 * The cold open in the courtyard: the mother and her baby, the table and
 * the bottle, the close two-shot of the smile, the letter falling and the
 * letter itself, the lead's wince and his question, and the cup and loaf.
 * No card: Heb 5:12 is lettered on the scroll he reads in cold-scroll as it
 * is read (`LETTER_QUOTE`; the owner asked for the quotes off black cards
 * and on the letter, journal.md).
 */
export const COLD_STORY: StoryScene = {
  scene: 'cold',
  light: COURTYARD,
  shots: [coldBaby, coldTable, coldSmile, coldLetter, coldScroll, coldOuch, coldAsk, coldWhat],
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
 * The milk: the villager and the book on the parchment, the open book on
 * the feast table, the milk poured from it into a cup there, and the row
 * drinking in turn on the parchment. No card: 1 Pet 2:2 is lettered on the
 * book's pages in milk-book as it is read (`BOOK_QUOTE`), and the milk
 * pours from that book in a moving stream (`POUR_STREAM`).
 */
export const MILK_STORY: StoryScene = {
  scene: 'milk',
  light: PARCHMENT,
  shots: [milkCup, milkBook, milkPour, milkRow],
  cards: [],
  over: [BOOK_QUOTE, POUR_STREAM],
};

/** Act 1's storybook scenes, each its shots, cards and light. */
export const STORIES: ReadonlyArray<StoryScene> = [COLD_STORY, TITLE_STORY, MILK_STORY];
