/**
 * No Contract file writes a size, weight, space, radius, line width,
 * shadow, duration or press as a literal: each is a token of `app.forma`
 * (`src/look/tokens.ts`), so the brand alone says each measure, as it alone
 * says each colour (`literal.test.ts`). A screen unit of the pixel match
 * still writing some keeps them in its allow list (`allow/<unit>.ts`),
 * which it empties as it draws its screens in One's tokens; an entry it no
 * longer needs fails here too, so the list only shrinks. `pm-tokens`'
 * files have none, nor has a unit once it lands (`LANDED`).
 */

import { describe, expect, it } from 'bun:test';
import type { AllowList } from '@manna/exact-kit/look';
import { beyond, measureLiterals } from '@manna/exact-kit/look/testing';

import { allowed as find } from './allow/pm-hy-find.ts';
import { allowed as home } from './allow/pm-hy-home.ts';
import { allowed as hymn } from './allow/pm-hy-hymn.ts';
import { allowed as player } from './allow/pm-hy-player.ts';
import { allowed as settings } from './allow/pm-hy-settings.ts';
import { appFile, contractFiles } from './design.testing.ts';

/** Each Contract file's unit in the pixel match (its spec's "The units"); `no unit` restyles none, so none has a list. */
const OWNER = new Map([
  ['app.contract', 'pm-tokens'],
  ['features/about.contract', 'pm-tokens'],
  ['features/list.contract', 'pm-hy-home'],
  ['features/recent.contract', 'pm-hy-home'],
  ['features/rail.contract', 'pm-hy-home'],
  ['features/find.contract', 'pm-hy-find'],
  ['features/hymn.contract', 'pm-hy-hymn'],
  ['features/chords.contract', 'pm-hy-hymn'],
  ['features/favourites.contract', 'pm-hy-hymn'],
  ['features/notfound.contract', 'pm-hy-hymn'],
  ['features/player.contract', 'pm-hy-player'],
  ['features/bar.contract', 'pm-hy-player'],
  ['features/sheet.contract', 'pm-hy-player'],
  ['features/reading.contract', 'no unit'],
  ['features/settings.contract', 'pm-hy-settings'],
  ['features/motion.contract', 'no unit'],
  ['features/abouthymn.contract', 'no unit'],
  ['features/pager.contract', 'no unit'],
  ['features/keys.contract', 'no unit'],
]);

const ALLOWED = new Map<string, AllowList>([
  ['pm-hy-find', find],
  ['pm-hy-home', home],
  ['pm-hy-hymn', hymn],
  ['pm-hy-player', player],
  ['pm-hy-settings', settings],
]);

/** The screen units whose screens have landed in One's tokens: each keeps an empty list (its spec's acceptance). */
const LANDED: ReadonlyArray<string> = ['pm-hy-home'];

/** What `file`'s unit lets it keep. */
const allowanceOf = (file: string) => ALLOWED.get(OWNER.get(file) ?? '')?.[file] ?? {};

describe('no Contract file writes a measure', () => {
  for (const file of contractFiles())
    it(`${file} writes its measures as tokens, or as its unit's list allows`, () => {
      expect(beyond(measureLiterals(appFile(file)), allowanceOf(file))).toEqual({
        extra: [],
        stale: [],
      });
    });

  it('each list names only its own unit’s files, and every file has its unit', () => {
    const strays = [...ALLOWED].flatMap(([unit, files]) =>
      Object.keys(files).filter((file) => OWNER.get(file) !== unit),
    );
    expect(strays).toEqual([]);
    expect(contractFiles().filter((file) => !OWNER.has(file))).toEqual([]);
  });

  it('a unit that has landed keeps an empty list', () => {
    expect(LANDED.map((unit) => [unit, ALLOWED.get(unit)])).toEqual(
      LANDED.map((unit) => [unit, {}]),
    );
  });

  it('finds a measure planted in a file of pm-tokens', () => {
    const file = 'features/about.contract';
    const planted = appFile(file).replace('gap="space.s8"', 'gap=8');
    expect(beyond(measureLiterals(planted), allowanceOf(file)).extra).toEqual(['gap=8']);
  });
});
