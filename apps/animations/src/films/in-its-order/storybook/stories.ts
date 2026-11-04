import { fullCard } from '@manna/film/canvas';
import type { StoryScene } from '../../../library/storybook/scene.ts';
import { CARD_STYLE } from '../card.ts';
import { COURTYARD, PARCHMENT } from './kit.ts';
import { coldBaby, coldLetter, coldOuch, coldTable, coldWhat } from './shots/cold.ts';
import { milkCup, milkPour, milkRow } from './shots/milk.ts';
import { TITLE_NAME, titleShot } from './shots/title.ts';

/**
 * The cold open in the courtyard: the mother and her baby, the table and
 * the bottle, the letter, the lead's wince and the cup and loaf; Heb 5:12's
 * clause on its card, cut in on "such" and out on the voiced end of "meat"
 * (the `ouch` mark less the hold after it).
 */
export const COLD_STORY: StoryScene = {
  scene: 'cold',
  light: COURTYARD,
  shots: [coldBaby, coldTable, coldLetter, coldOuch, coldWhat],
  cards: [
    {
      span: { mark: 'such', until: 'ouch', untilOffset: -0.6 },
      from: 'such',
      to: 'ouch',
      payoff: 'meat',
      draw: (f, words) => fullCard(f, words, CARD_STYLE),
    },
  ],
  over: [],
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
 * row drinking in turn; 1 Pet 2:2 on its card, cut in on "desire" and out
 * at the end of "thereby" (`milk-pour:thereby`, pinned to the word).
 */
export const MILK_STORY: StoryScene = {
  scene: 'milk',
  light: PARCHMENT,
  shots: [milkCup, milkPour, milkRow],
  cards: [
    {
      span: { mark: 'desire', until: { cue: 'milk-pour:thereby' } },
      from: 'desire',
      to: 'sincere',
      payoff: 'grow',
      draw: (f, words) => fullCard(f, words, CARD_STYLE),
    },
  ],
  over: [],
};

/** Act 1's storybook scenes, each its shots, cards and light. */
export const STORIES: ReadonlyArray<StoryScene> = [COLD_STORY, TITLE_STORY, MILK_STORY];
