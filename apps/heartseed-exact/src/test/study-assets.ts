/**
 * The assets `bible.db` is built from, read once per test part, and the
 * app's own text: what the study packs' tests hold the packs to, so no
 * verse, definition or rendering is written in a test.
 */

import { corpus } from '../../tools/kjv';
import { canonChapters } from '../study/canon';

/** The canon's chapters and the app's text, as the packs are built over them. */
export const appSource = () => ({ canon: canonChapters(), chapters: corpus() });

/** Each chapter's verse count in the app's text, by `book.chapter`. */
export const verseCounts = (): ReadonlyMap<string, number> => {
  const { canon, chapters } = appSource();
  return new Map(
    canon.map(([book, chapter], index) => [
      `${book}.${chapter}`,
      (chapters[index] ?? '').split('\n').length,
    ]),
  );
};
