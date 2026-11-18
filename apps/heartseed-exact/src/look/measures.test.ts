/* oxlint-disable effect/noNullish -- Exact's app folder cannot import effect (docs/exact.md): a file no unit owns and a unit with no list are absent as undefined. */

/**
 * No Contract file writes a size, weight, space, radius, line width,
 * shadow, duration or press as a literal: each is a token of `app.forma`
 * (`src/look/tokens.ts`), so the brand alone says each measure, as it alone
 * says each colour. A screen unit of the pixel match still writing some
 * keeps them in its allow list (`allow/<unit>.ts`), which it empties as it
 * draws its screens in One's tokens; an entry it no longer needs fails
 * here too, so the list only shrinks. `pm-tokens`' files have none.
 */

import { describe, expect, it } from 'bun:test';
import type { AllowList } from '@manna/exact-kit/look';
import { beyond, measureLiterals } from '@manna/exact-kit/look/testing';

import { readContracts } from '../../tools/look';
import { allowed as add } from './allow/pm-hs-add';
import { allowed as home } from './allow/pm-hs-home';
import { allowed as read } from './allow/pm-hs-read';
import { allowed as settings } from './allow/pm-hs-settings';
import { allowed as study } from './allow/pm-hs-study';
import { allowed as today } from './allow/pm-hs-today';

/** Each Contract file's unit in the pixel match (its spec's "The units"); `no unit` restyles none, so none has a list. */
const OWNER = new Map([
  ['app.contract', 'pm-tokens'],
  ['features/about.contract', 'pm-tokens'],
  ['features/home.contract', 'pm-hs-home'],
  ['features/list.contract', 'pm-hs-home'],
  ['features/today.contract', 'pm-hs-today'],
  ['features/session.contract', 'pm-hs-today'],
  ['features/settings.contract', 'pm-hs-settings'],
  ['features/feel.contract', 'pm-hs-settings'],
  ['features/add.contract', 'pm-hs-add'],
  ['features/chooser.contract', 'pm-hs-read'],
  ['features/goto.contract', 'pm-hs-read'],
  ['features/read.contract', 'pm-hs-read'],
  ['features/find.contract', 'pm-hs-read'],
  ['features/garden.contract', 'pm-hs-read'],
  ['features/text.contract', 'pm-hs-read'],
  ['features/study.contract', 'pm-hs-study'],
  ['features/studydata.contract', 'pm-hs-study'],
  ['features/commentary.contract', 'pm-hs-study'],
  ['features/packs.contract', 'pm-hs-study'],
  ['features/type.contract', 'pm-hs-study'],
  ['features/motion.contract', 'no unit'],
]);

const ALLOWED = new Map<string, AllowList>([
  ['pm-hs-add', add],
  ['pm-hs-home', home],
  ['pm-hs-read', read],
  ['pm-hs-settings', settings],
  ['pm-hs-study', study],
  ['pm-hs-today', today],
]);

/** What `file`'s unit lets it keep. */
const allowanceOf = (file: string) => ALLOWED.get(OWNER.get(file) ?? '')?.[file] ?? {};

const contracts = readContracts();

describe('no Contract file writes a measure', () => {
  for (const [path, text] of contracts)
    it(`${path} writes its measures as tokens, or as its unit's list allows`, () => {
      expect(beyond(measureLiterals(text), allowanceOf(path))).toEqual({ extra: [], stale: [] });
    });

  it('each list names only its own unit’s files, and every file has its unit', () => {
    const strays = [...ALLOWED].flatMap(([unit, files]) =>
      Object.keys(files).filter((file) => OWNER.get(file) !== unit),
    );
    expect(strays).toEqual([]);
    expect([...contracts.keys()].filter((path) => !OWNER.has(path))).toEqual([]);
  });

  it('finds a measure planted in a file of pm-tokens', () => {
    const path = 'features/about.contract';
    const planted = (contracts.get(path) ?? '').replace('gap="space.s16"', 'gap=16');
    expect(beyond(measureLiterals(planted), allowanceOf(path)).extra).toEqual(['gap=16']);
  });
});
