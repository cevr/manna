/* oxlint-disable effect/noNodeBuiltinImport, effect/noAsyncFunction, effect/noGlobals -- a Bun test reading tracked source files, as the gate's other source checks do. */

/**
 * The Contract's actions are `navStep`'s compositions, read from the
 * Contract files' text as `src/home/words.test.ts` reads the asks: the bar's
 * `pick`, the host's `follow`, the gear and Done, `readOpenAt` and
 * `readFollow`, so a change to one fails here until `nav.ts` and its model
 * test say the same. Also the route table: Garden first and where the app
 * opens, every route there was nested under it at its own address, Read
 * second with `readAt` under it.
 */

import { expect, it } from 'bun:test';
import { join } from 'node:path';

import { navLaunch, navStep, readAtPath } from './nav';

const APP = join(import.meta.dir, '../..');
const read = (path: string) => Bun.file(join(APP, path)).text();

it("holds the bar's, the host's and Settings' actions to navStep", async () => {
  const app = await read('app.contract');
  expect(app).toContain('  action pick(name: string)\n    nav = select(nav, name)\n');
  expect(app).toContain(
    [
      '  action follow(url: string)',
      '    if url.startsWith("/read") and nav.tab != "read"',
      '      nav = go(select(nav, "read"), url)',
      '    else if not url.startsWith("/read") and not url.startsWith("/settings") and nav.tab != "garden"',
      '      nav = go(select(nav, "garden"), url)',
      '    else',
      '      nav = go(nav, url)',
    ].join('\n'),
  );
  const settings = await read('features/settings.contract');
  expect(settings).toContain('  action settingsOpen\n    nav = push(nav, "/settings")\n');
  expect(settings).toContain('  action settingsDone\n    nav = back(nav)\n');
});

it("holds readOpenAt and readFollow to navStep, each landing on the verse's row", async () => {
  const contract = await read('features/read.contract');
  expect(contract).toContain(
    [
      '  action readOpenAt(book: number, chapter: number, verse: number)',
      '    readBookKept = `${book}`',
      '    readChapterKept = `${chapter}`',
      '    readOpenVerse = verse',
      '    chooserFirst = 0',
      '    chooserLast = 0',
      '    chooserAnswer = ""',
      '    nav = open(nav, path("read") + `#verse-${verse}`)',
    ].join('\n'),
  );
  const at = 'path("readAt", `${book}`, `${chapter}`, `${verse}`) + `#verse-${verse}`';
  expect(contract).toContain(
    [
      '  action readFollow(book: number, chapter: number, verse: number)',
      '    chooserFirst = 0',
      '    chooserLast = 0',
      '    chooserAnswer = ""',
      '    if nav.tab == "read"',
      `      nav = push(nav, ${at})`,
      '    else',
      `      nav = push(select(nav, "read"), ${at})`,
    ].join('\n'),
  );
  const opened = navStep(navLaunch(), { _tag: 'readOpenAt', book: 19, chapter: 119, verse: 176 });
  expect(opened.nav.read).toEqual([{ id: 1, name: 'read', url: '/read', fragment: 'verse-176' }]);
  expect(readAtPath(43, 3, 16)).toBe('/read/at/43/3/16#verse-16');
});

it('nests every route under Garden at its address, Garden first, then Read and readAt', async () => {
  const app = await read('app.contract');
  const table = /routes nav\n((?: {2}.*\n)+)/u.exec(app)?.[1] ?? '';
  const routes = [...table.matchAll(/^( +)(tab |)(\w+) "([^"]+)"/gmu)].map((each) => [
    String(each[1]).length / 2,
    String(each[2]).trim(),
    each[3],
    each[4],
  ]);
  expect(routes[0]).toEqual([1, 'tab', 'garden', '/']);
  expect(routes.filter((each) => each[1] === 'tab').map((each) => each[2])).toEqual([
    'garden',
    'read',
  ]);
  expect(routes.slice(-2)).toEqual([
    [1, 'tab', 'read', '/read'],
    [2, '', 'readAt', '/read/at/:book/:chapter/:verse'],
  ]);
  const garden = routes.slice(1, -2);
  expect(garden.every((each) => Number(each[0]) >= 2 && !String(each[3]).startsWith('/read'))).toBe(
    true,
  );
  expect(garden.map((each) => each[2])).toEqual([
    'list',
    'settings',
    'settingsAbout',
    'settingsLicences',
    'today',
    'start',
    'cued',
    'verses',
    'add',
    'addBible',
    'addBook',
    'addChapter',
    'addList',
  ]);
});
