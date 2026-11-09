/* oxlint-disable effect/noGlobals -- the generator's writer: JSON.stringify writes each line of the committed files in a fixed key order, so two runs write the same bytes. */

/**
 * The public contents page of Haskell's *Bible Handbook* (no sign-in), the
 * one full list of its headings (R1). The generator keeps a committed
 * snapshot of its titles and paragraph ids, so a regeneration needs no
 * network.
 */
export const CONTENTS_URL = 'https://text.egwwritings.org/book/b978';

/** One entry of the contents: its paragraph number, its level (1 a section, 2 a sub-heading) and its title as the page writes it. */
export interface Entry {
  readonly para: number;
  readonly level: 1 | 2;
  readonly title: string;
}

const TOKEN =
  /<a href="\/read\/978\.(\d+)" class="book-toc__link[^"]*">([\s\S]*?)<\/a>|<ul class="book-toc__list book-toc__sublist">|<\/ul>/g;

/** R1: every link of the contents page in page order, level 2 inside a sub-list, its title's tags stripped and each run of whitespace one space. */
export const contentsOf = (html: string): readonly Entry[] => {
  const entries: Entry[] = [];
  let level: 1 | 2 = 1;
  for (const [token, para = '', title = ''] of html.matchAll(TOKEN)) {
    if (token.startsWith('<ul')) level = 2;
    else if (token === '</ul>') level = 1;
    else
      entries.push({
        para: Number(para),
        level,
        title: title
          .replace(/<[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      });
  }
  return entries;
};

/** The snapshot's text: its source, then one entry per line, in page order. */
export const contentsText = (entries: readonly Entry[]): string =>
  [
    '{',
    `"source":${JSON.stringify(CONTENTS_URL)},`,
    '"entries":[',
    entries.map((entry) => JSON.stringify(entry)).join(',\n'),
    ']',
    '}',
    '',
  ].join('\n');
