/**
 * Reading's source, as `app.ts` registers it: `readingAt(size, font,
 * spacing)` the Reading group's rows and the page's text under the kept
 * texts (`readingOf`).
 */

import { readingOf } from './reading.ts';

export const readingSources = () => ({
  readingAt: ([size, font, spacing]: readonly [string, string, string]) =>
    readingOf(size, font, spacing),
});
