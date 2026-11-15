/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport, effect/noAs, effect/noTryCatch, effect/noTernary -- a Bun test that runs the current hymnal's appearance rule on a stand-in page (the `document` it writes, put back after), reads the page's scheme as CSS does, reads its settings source's text for the default, and decodes with its Effect schema, typed in the port's declaration by its literals alone. */

/**
 * The appearance setting is the current hymnal's (A1): the choices, in
 * order, are its `Appearance` literals; any kept text reads as its schema
 * decodes it, and text it refuses reads as its default; and for every
 * choice and system scheme, the scheme shown is the one the current web
 * app's `applyAppearance` gives its page.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import { applyAppearance } from '@manna/hymnal-app/appearance';
import { Appearance } from '@manna/hymnal-app/settings';
import { Option, Schema } from 'effect';

import { below, pick, seeded } from '../test/random.ts';
import { type Look, type Scheme, lookOf, lookRows, looks, shownOf } from './look.ts';

/** The current app's reading of a kept value: its schema's, else the default its settings give. */
const decoded = Schema.decodeUnknownOption(Appearance as unknown as Schema.Codec<Look>);

const settingsSource = readFileSync(
  new URL('../../../hymnal/src/settings.ts', import.meta.url),
  'utf8',
);
const fallback = /setting\('appearance', Appearance, '(\w+)'\)/u.exec(settingsSource)?.[1];

const NEAR = ['', 'Dark', 'DARK', ' dark', 'dark ', '"dark"', 'light dark', 'auto', 'none', 'null'];
const LETTERS = 'adghiklmnorstuy "\'';

/** Kept text as a store may hold it: a choice, a near miss, or letters at random. */
const keptText = (random: () => number): string =>
  pick(random, [
    () => pick(random, looks),
    () => pick(random, NEAR),
    () => Array.from({ length: below(random, 8) }, () => pick(random, [...LETTERS])).join(''),
  ])();

describe('the appearance setting is the current hymnal’s', () => {
  it('offers its choices, in its order', () => {
    expect([...looks]).toEqual([...Appearance.literals]);
    expect(lookRows('system').map((row) => row.value)).toEqual([...Appearance.literals]);
  });

  it('reads any kept text as the current app decodes it, its default where it refuses', () => {
    expect(fallback).toBe('system');
    const random = seeded(7);
    for (let run = 0; run < 2000; run++) {
      const kept = keptText(random);
      const want = Option.getOrElse(decoded(kept), () => fallback as Look);
      expect({ kept, look: lookOf(kept) }).toEqual({ kept, look: want });
      expect(
        lookRows(kept)
          .filter((row) => row.chosen)
          .map((row) => row.value),
      ).toEqual([want]);
    }
  });

  it('shows the scheme the current web app gives its page, for every choice and system scheme', () => {
    const page = { documentElement: { style: { colorScheme: '' } } };
    const was = globalThis.document;
    Object.assign(globalThis, { document: page });
    try {
      for (const look of looks)
        for (const system of ['light', 'dark'] as const satisfies ReadonlyArray<Scheme>) {
          applyAppearance(look);
          const set = page.documentElement.style.colorScheme;
          const shown: string = set === 'light dark' ? system : set;
          const port: string = shownOf(look, system);
          expect({ look, system, shown: port }).toEqual({ look, system, shown });
        }
    } finally {
      Object.assign(globalThis, { document: was });
    }
  });
});
