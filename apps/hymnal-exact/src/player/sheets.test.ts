/* oxlint-disable effect/noNodeBuiltinImport, effect/noNullish, effect/noAs, effect/noGlobals, effect/noAsyncFunction -- a Bun test, which awaits the current app's bar once, that reads `app.contract`'s routes and `features/player.contract`'s `playerPaths` line as text and evaluates that line's rule, as the contract runs it, for each route. */

/**
 * The bar treats a screen as One does (`apps/hymnal/src/player/bar.ts`
 * `SHEETS`): for every route `app.contract` declares, the path the port's
 * `playerPaths` gives it is a sheet's path (the player's `SHEET` or
 * `SETTINGS`, `step.ts`), so the bar is not docked and reachable under it,
 * exactly when One's route for that screen is one of One's sheets.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { current } from './current.testing.ts';
import { SETTINGS, SHEET } from './step.ts';

const appDir = join(import.meta.dir, '..', '..');
const read = (file: string) => readFileSync(join(appDir, file), 'utf8');

type Entry = { readonly name: string; readonly params: { readonly n: string } };

/**
 * Each port route's screen at One's path (`apps/hymnal/app/(hymnal)/`): the
 * hymn's About is One's `about.tsx`, the app's About is drawn inside
 * `settings.tsx`, and the not-found screen is a path no route holds.
 */
const ONE_PATH = new Map([
  ['list', '/'],
  ['hymn', '/hymns/1'],
  ['chord', '/chord'],
  ['abouthymn', '/about'],
  ['player', '/player'],
  ['settings', '/settings'],
  ['about', '/settings'],
  ['recent', '/recent'],
  ['tuner', '/tuner'],
  ['notfound', '/no-such-path'],
]);

/** The route names of `app.contract`'s `routes nav` block, in order. */
const routeNames = (): ReadonlyArray<string> => {
  const lines = read('app.contract').split('\n');
  const block = lines.slice(lines.indexOf('routes nav') + 1);
  return block
    .slice(
      0,
      block.findIndex((line) => !line.startsWith('  ')),
    )
    .map((line) => line.trim().split(/\s+/)[0] ?? '')
    .filter((name) => name !== '');
};

/** The body of `playerPaths`' `stack(nav).map(e => …)`, as its contract line says it. */
const ruleText = (): string =>
  read('features/player.contract')
    .split('\n')
    .find((each) => each.trim().startsWith('derive playerPaths ='))
    ?.match(/\.map\(e => (.*)\)\.join\(" "\)$/)?.[1] ?? '';

/** `playerPaths`' rule for one stack entry, run as the contract runs it (`or`, `and` read as JavaScript's). */
const ruleOf = (text: string): ((entry: Entry) => string) =>
  new Function(
    'e',
    `return (${text.replaceAll(/\bor\b/g, '||').replaceAll(/\band\b/g, '&&')});`,
  ) as (entry: Entry) => string;

describe('the bar under a sheet', () => {
  it('maps every route app.contract declares', () => {
    expect([...routeNames()].toSorted()).toEqual([...ONE_PATH.keys()].toSorted());
  });

  it("gives a sheet's path to a route exactly when One's route for that screen is a sheet", async () => {
    const { SHEETS } = (await current()).bar;
    const text = ruleText();
    expect(text).not.toBe('');
    const rule = ruleOf(text);
    const port = routeNames().filter((name) => {
      const path = rule({ name, params: { n: '1' } });
      return path === SHEET || path === SETTINGS;
    });
    const one = routeNames().filter((name) => SHEETS.has(ONE_PATH.get(name) ?? ''));
    expect(port).toEqual(one);
    expect(one).toContain('chord');
    expect(rule({ name: 'hymn', params: { n: '7' } })).toBe('/hymns/7');
  });
});
