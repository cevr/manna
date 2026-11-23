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
import { DRAWN, removeAskOf, STAGE_WORDS, stageLineOf } from '../list/page';

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

it('each stage’s picture on a list’s page is the current page’s', async () => {
  const source = await Bun.file(join(CURRENT, 'field/plot.tsx')).text();
  const block = /export const DRAWN[^{]*\{([^}]*)\}/u.exec(source)?.[1] ?? '';
  const drawn = Object.fromEntries(
    [...block.matchAll(/'?([a-z][a-z ]*)'?: '([^']*)'/gu)].map((each) => [each[1], each[2]]),
  );
  expect(drawn).toEqual({ ...DRAWN });
});

it('a row’s stage line is the current list page’s', async () => {
  const source = await Bun.file(join(CURRENT, 'list/screen.tsx')).text();
  expect(source).toContain('return `${STAGE_SHOWN[plant.stage]} · ready today`;');
  expect(stageLineOf('A seed', true)).toBe('A seed · ready today');
  expect(stageLineOf('A seed', false)).toBe('A seed');
});

it('the field’s own words on home are the current home’s', async () => {
  const source = await Bun.file(join(CURRENT, 'field/screen.tsx')).text();
  const home = await Bun.file(join(FEATURES, 'home.contract')).text();
  const shown = (words: string) =>
    new RegExp(`>\\s*${words}\\s*<|shown="${words}"`, 'u').test(source);
  for (const words of ['Your field', 'Lists', 'Add a list'])
    expect({ words, one: shown(words), port: home.includes(`"${words}"`) }).toEqual({
      words,
      one: true,
      port: true,
    });
});

it('each picture is drawn at the current app’s size (the `glyph.` tokens)', async () => {
  const forma = await Bun.file(join(FEATURES, '..', 'app.forma')).text();
  const sizeIn = async (file: string, pattern: RegExp) =>
    pattern.exec(await Bun.file(join(CURRENT, file)).text())?.[1];
  const tokenOf = (name: string) =>
    new RegExp(`${name.replace('.', '\\.')}: length = (\\d+)px`, 'u').exec(forma)?.[1];
  expect(await sizeIn('field/screen.tsx', /<Icon name=\{greeting\.icon\} size=\{(\d+)\}/u)).toBe(
    tokenOf('glyph.greeting'),
  );
  expect(
    await sizeIn('field/plot.tsx', /onSome: \(name\) => <Icon name=\{name\} size=\{(\d+)\}/u),
  ).toBe(tokenOf('glyph.control'));
  expect(await sizeIn('list/screen.tsx', /<Icon name=\{furrow\.icon\} size=\{(\d+)\}/u)).toBe(
    tokenOf('glyph.list'),
  );
  expect(await sizeIn('list/screen.tsx', /name=\{DRAWN\[plant\.stage\]\} size=\{(\d+)\}/u)).toBe(
    tokenOf('glyph.list'),
  );
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
