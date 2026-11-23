/* oxlint-disable effect/noNodeBuiltinImport -- a Bun test that writes the pages into a scratch folder of its own, to hold the writer to writing only what changed. */

/**
 * The site's pages (`pagesOf`) and their writer (A3): a page for every
 * address a screen has and `404.html` for the rest, each the shell with
 * only its title and description changed, the text escaped; written into
 * a folder, a second run over the same shell writes nothing.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writePages } from '../../tools/web/pages.ts';
import { book } from '../hymns/book.testing.ts';
import { pagesOf, withHead } from './pages.ts';
import { placeOf } from './place.ts';

const SHELL =
  '<!doctype html>\n<html lang="en">\n<title>Hymnal</title>\n<script type="module" src="./app.js"></script>\n<div id="exact-root"></div>\n';

describe("the site's pages", () => {
  const pages = pagesOf(book, SHELL);
  const byNumber = new Map(book.hymns.map((hymn) => [hymn.number, hymn]));

  test('each address a screen has is a page, and 404.html the rest', () => {
    const opened = [...pages.keys()]
      .filter((file) => file !== '404.html')
      .map((file) => placeOf(book, `/${file.replace(/(^|\/)index\.html$/u, '')}`).screen);
    expect(opened.filter((screen) => screen === 'notfound')).toEqual([]);
    expect(opened.filter((screen) => screen === 'hymn')).toHaveLength(book.hymns.length);
    expect(
      ['list', 'recent', 'player', 'settings', 'about'].every((screen) =>
        opened.includes(screen as 'list'),
      ),
    ).toBe(true);
    expect(pages.has('404.html')).toBe(true);
  });

  test("a page is the shell with its own title and description, and a hymn's names it", () => {
    for (const [file, html] of pages) {
      expect(
        html.replace(
          /<title>[^<]*<\/title>(\n<meta [^>]*>)*(\n<link rel="modulepreload" [^>]*>)*/u,
          '<title>Hymnal</title>',
        ),
      ).toBe(SHELL);
      expect(html).toContain('<meta name="description" content="');
      const preloads = [...html.matchAll(/<link rel="modulepreload" href="([^"]*)">/gu)].map(
        (found) => found[1],
      );
      if (!file.startsWith('hymns/')) expect(preloads).toEqual([]);
      if (file.startsWith('hymns/')) {
        const n = Number(file.split('/')[1]);
        expect(preloads).toEqual(['./modules/index.js', `./modules/chords/${n}.js`]);
        const hymn = byNumber.get(n);
        expect(html).toContain(`content="Hymn ${n} of the hymnal`);
        const title = withHead('<title></title>', { title: hymn?.title ?? '-', description: '' });
        expect(html).toContain(title.split('\n')[0] ?? '-');
      }
    }
  });

  test('its text is escaped', () => {
    const html = withHead(SHELL, { title: 'A <b> & "c"', description: "d's" });
    expect(html).toContain('<title>A &#60;b&#62; &#38; &#34;c&#34;</title>');
    expect(html).toContain('content="d&#39;s"');
  });

  test('written twice over one shell, the second run writes nothing', () => {
    const few = {
      ...book,
      hymns: book.hymns.filter((hymn) => [1, 100, 695].includes(hymn.number)),
    };
    const fewPages = pagesOf(few, SHELL);
    const dir = mkdtempSync(join(tmpdir(), 'hymnal-pages-'));
    writeFileSync(join(dir, 'shell.html'), SHELL);
    const first = writePages(dir, few);
    const before = statSync(join(dir, 'hymns/100/index.html')).mtimeMs;
    const second = writePages(dir, few);
    const after = statSync(join(dir, 'hymns/100/index.html')).mtimeMs;
    const notFound = readFileSync(join(dir, '404.html'), 'utf8');
    rmSync(dir, { recursive: true, force: true });
    expect(first).toEqual({ wrote: fewPages.size, kept: 0 });
    expect(second).toEqual({ wrote: 0, kept: fewPages.size });
    expect(after).toBe(before);
    expect(notFound).toBe(pages.get('404.html') ?? '-');
  });
});
