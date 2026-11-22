/* oxlint-disable effect/noNodeBuiltinImport, effect/noAsyncFunction, effect/noGlobals -- a Bun test reading tracked Contract files, as src/read/read.test.ts does. */

/**
 * The first minute's, the tour's and home's tips' words in the Contract are
 * the current Heartseed's own (`@manna/heartseed/first/words`,
 * `@manna/heartseed/field/tips`): each one is written, as a quoted literal,
 * in the file that draws it, so a word changed on either side fails here.
 */

import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { TIPS } from '@manna/heartseed/field/tips';
import { COPY, GROWS, ONWARD, PILLS, REPLAY, WELCOME } from '@manna/heartseed/first/words';

const APP = join(import.meta.dir, '../..');
const read = (path: string) => Bun.file(join(APP, path)).text();
const first = await read('features/first.contract');
const home = await read('features/home.contract');
const settings = await read('features/settings.contract');

const quoted = (words: string) => `"${words}"`;

const rows: ReadonlyArray<readonly [string, string, string]> = [
  ...Object.entries(WELCOME).map(([key, words]) => [`welcome ${key}`, first, words] as const),
  ...Object.entries(GROWS).map(([key, words]) => [`grows ${key}`, first, words] as const),
  ...Object.entries(ONWARD).map(([key, words]) => [`onward ${key}`, first, words] as const),
  ...Object.entries(COPY).flatMap(([phase, copy]) => [
    [`${phase} heading`, first, copy.heading] as const,
    [`${phase} line`, first, copy.line] as const,
  ]),
  ['pill next', first, PILLS.next],
  ['pill continue', first, PILLS.continue],
  ['pill listen', first, PILLS.listen],
  ['stage', first, PILLS.stage],
  ['stage said', first, PILLS.stageSaid],
  ['pill got it', home, PILLS.gotIt],
  ['replay how', home, REPLAY.how],
  ['replay again', settings, REPLAY.again],
  ...Object.entries(TIPS).map(([n, words]) => [`tip ${n}`, home, words] as const),
];

describe("the first minute's words are the current app's", () => {
  for (const [name, text, words] of rows)
    it(name, () => {
      expect(text).toContain(quoted(words));
    });

  it('each tip stands under its own number', () => {
    for (const [n, words] of Object.entries(TIPS))
      expect(home).toContain(`HomeTip(n=${n}, words=${quoted(words)})`);
  });
});
