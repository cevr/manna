/**
 * The built site's pages, made from the shell the build writes
 * (`shell.html`): one per address a screen has, each the shell with the
 * screen's own `<title>` and description, so a link to it previews as the
 * screen (the list, a hymn by its number and title, Recent, the player),
 * and `404.html` for every other address. The browser draws each from the
 * same script; nothing is rendered at build, so no page carries answers
 * that a reader's kept lists would make stale (README.md, "The web").
 */

import type { Book } from '../hymns/book.ts';
import { hymnPages } from './place.ts';

interface Head {
  readonly title: string;
  readonly description: string;
}

const NAME = 'Hymnal';

const escaped = (text: string) => text.replace(/[&<>"']/gu, (char) => `&#${char.charCodeAt(0)};`);

/** The shell with `head`'s title and description in place of its own title. */
export const withHead = (shell: string, head: Head): string => {
  const title = escaped(head.title);
  const description = escaped(head.description);
  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:site_name" content="${NAME}">`,
  ].join('\n');
  return shell.replace(/<title>[^<]*<\/title>/u, () => tags);
};

/** Each page's file, relative to the build's folder, and its head. */
export const headsOf = (book: Book): ReadonlyArray<readonly [string, Head]> => [
  [
    'index.html',
    {
      title: 'Hymns',
      description: `The hymnal's ${book.hymns.length} hymns: their words, and each one's recording.`,
    },
  ],
  ['recent/index.html', { title: 'Recent', description: 'The hymns you opened last.' }],
  [
    'player/index.html',
    { title: 'Now Playing', description: 'The hymn playing, and its stanzas.' },
  ],
  ['404.html', { title: 'No Such Page', description: 'The hymnal has no page at this address.' }],
  ...hymnPages(book).map((n) => {
    const hymn = book.hymns.find((each) => `${each.number}` === n);
    return [
      `hymns/${n}/index.html`,
      {
        title: hymn?.title ?? n,
        description: `Hymn ${n} of the hymnal, under ${hymn?.topic ?? ''}.`,
      },
    ] as const;
  }),
];

/** Every page of the site, by its file, made from `shell`. */
export const pagesOf = (book: Book, shell: string): ReadonlyMap<string, string> =>
  new Map(headsOf(book).map(([file, head]) => [file, withHead(shell, head)]));
