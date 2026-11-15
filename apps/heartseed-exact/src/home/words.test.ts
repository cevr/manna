/* oxlint-disable effect/noNodeBuiltinImport, effect/noAsyncFunction, effect/noGlobals -- a Bun test reading tracked source files, as the gate's other source checks do. */

/**
 * The words home and a list's page write that the current Heartseed keeps
 * in its React files, which the port cannot import: the asks and each
 * stage in words. Each is held to that file's own text, so a change there
 * fails here. And the Contract's ask actions are held to `askStep`: only
 * the ask's Yes removes or moves back, and on the row the ask is open on.
 */

import { expect, it } from 'bun:test';
import { join } from 'node:path';

import { singleAskOf } from './home';
import { removeAskOf, STAGE_WORDS } from '../list/page';

const CURRENT = join(import.meta.dir, '../../../heartseed/src');
const FEATURES = join(import.meta.dir, '../../features');

/** The one template literal in `source` that ends with `words`, its placeholders filled with `value`. */
const templateIn = (source: string, words: string, value: string) => {
  const found = [...source.matchAll(/`([^`\n]*)`/gu)]
    .map((each) => each[1] ?? '')
    .filter((each) => each.startsWith('Remove ${') && each.endsWith(words));
  expect(found.length).toBe(1);
  return (found[0] ?? '').replaceAll(/\$\{[^}]+\}/gu, value);
};

it("a single verse's ask is the current home's", async () => {
  const source = await Bun.file(join(CURRENT, 'field/singles.tsx')).text();
  expect(singleAskOf('John 3:16')).toBe(
    templateIn(source, 'Its plant stays in your field.', 'John 3:16'),
  );
});

it("a list's ask is the current list page's", async () => {
  const source = await Bun.file(join(CURRENT, 'list/screen.tsx')).text();
  expect(removeAskOf('John 3:16-18')).toBe(
    templateIn(source, 'Its plants stay in your field.', 'John 3:16-18'),
  );
});

it('each stage in words is the current list page’s', async () => {
  const source = await Bun.file(join(CURRENT, 'list/screen.tsx')).text();
  const block = /const STAGE_SHOWN[^{]*\{([^}]*)\}/u.exec(source)?.[1] ?? '';
  const shown = Object.fromEntries(
    [...block.matchAll(/'?([a-z][a-z ]*)'?: '([^']*)'/gu)].map((each) => [each[1], each[2]]),
  );
  expect(shown).toEqual({ ...STAGE_WORDS });
});

it("the Contract's asks act on Yes alone, on the row asked (askStep)", async () => {
  const home = await Bun.file(join(FEATURES, 'home.contract')).text();
  const list = await Bun.file(join(FEATURES, 'list.contract')).text();
  const removes = [...home.matchAll(/gardenRemoveIt\(([^)]*)\)/gu)].map((each) => each[1]);
  expect(removes).toEqual(['homeAsking']);
  expect(home).toContain(
    '  action homeYes\n    if homeAsking != ""\n      gardenRemoveIt(homeAsking)\n    homeAsking = ""',
  );
  expect(home).toContain('  action homeNo\n    homeAsking = ""');
  expect(home).toContain('  action homeAsk(key: string)\n    homeAsking = key');
  const acts = [...list.matchAll(/(gardenRemoveIt|gardenMoveBack)\(([^)]*)\)/gu)].map(
    (each) => `${each[1]}(${each[2]})`,
  );
  expect(acts).toEqual(['gardenRemoveIt(listShown.removeId)', 'gardenMoveBack(listAsking)']);
  expect(list).toContain('  action listYes\n    if listAsking == "remove"');
  expect(list).toContain('  action listNo\n    listAsking = ""');
});
