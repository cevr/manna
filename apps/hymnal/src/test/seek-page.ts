/**
 * What the held reader's tests (`WordSeek.test.tsx`, `WordSeek.web.test.tsx`)
 * read off a page `mountSeekReader` mounted at `VIEWPORT` points tall: where
 * a chosen line sits against the middle of the words seen over the sounding
 * bar, which actions the page offers a screen reader, the choice it shows,
 * and the seeks the player was sent.
 */

import type { Effect } from 'effect';

import { HASH, HASH_GAP, REST, SOUNDING } from '~/player/bar';

import { fixtureRects, HYMN_PAGE_ROOM, type mountSeekReader } from './reader-word-seek';
import type { openWordSeek } from './word-seek';

export type SeekPage = Effect.Success<ReturnType<typeof mountSeekReader>>;

/** The lyric viewport's height the tests mount the page with. */
export const VIEWPORT = 800;

/**
 * The highest the sounding bar and its `#` reach over a hymn page's foot,
 * as the player lays them out: the bar rises `SOUNDING - REST` over the
 * page, and the `#` stands `HASH_GAP` over the bar while the find room says
 * it is there. The words are seen down to it.
 */
export const barReach = (room: number) => SOUNDING - REST + ((room > 0 && HASH_GAP + HASH) || 0);

/** How far line `k`'s block's middle sits from the middle of the words seen, after the page's last scroll. */
export const offMiddle = (page: SeekPage, k: number, floor = barReach(HYMN_PAGE_ROOM)) => {
  const rect = fixtureRects[k] ?? { top: 0, height: 0 };
  const y = page.scrolls.at(-1)?.y ?? 0;
  return Math.abs(page.padTop() + rect.top + rect.height / 2 - y - (VIEWPORT - floor) / 2);
};

/** Whether the page offers a screen reader the action `name` on its words. */
export const offers = (page: SeekPage, name: string) => page.offers().includes(name);

/** The outlined line and its underlined word, by place (-1 for none), and whether that line is centred. */
export const choiceShown = (page: SeekPage) => {
  const line = page.chosenLines()[0] ?? -1;
  return [line, page.underlined(line)[0] ?? -1, offMiddle(page, line) <= 2];
};

/** The positions, in ms, of every seek the app sent its player. */
export const seeks = (app: Effect.Success<ReturnType<typeof openWordSeek>>) =>
  app.commands.filter(({ kind }) => kind === 'seek').map(({ ms }) => ms);
