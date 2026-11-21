/* oxlint-disable effect/noNodeBuiltinImport -- a Bun test that reads the current hymnal's settings source for its defaults and decodes with its Effect schemas. */

/**
 * Settings' chord choices are the current hymnal's (A1): the Chord style
 * and Chord placement rows are its `chordStyles` and `placements`, in its
 * order and words, one chosen and every row but the first divided; any
 * kept text reads as its store reads it, the text its schema decodes and
 * else the default its settings give (`chords.style`, `chords.placement`);
 * and the declaration Exact's type check reads stays true to the source.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import * as choices from '@manna/hymnal-app/chord-choices';
import { ChordStyle } from '@manna/hymnal-app/hymns/simple';
import { Placement } from '@manna/hymnal/placement';
import { Option, Schema } from 'effect';

import { withDataHost } from '@manna/exact-kit/data-host/testing';

import { sourcesAt } from '../sources.ts';
import { below, pick, seeded } from '../test/random.ts';
import { chordChoices, placementOf, styleOf } from './chords.ts';
import type * as ChoicesDecl from './decl/chord-choices';

const settingsSource = readFileSync(
  new URL('../../../hymnal/src/settings.ts', import.meta.url),
  'utf8',
);
const fallbackOf = (key: string, schema: string) =>
  String(new RegExp(`setting\\('${key}', ${schema}, '(\\w+)'\\)`, 'u').exec(settingsSource)?.[1]);

const styleDefault = fallbackOf('chords.style', 'ChordStyle');
const placementDefault = fallbackOf('chords.placement', 'Placement');

const NEAR = ['', 'Simple', 'ADVANCED', ' beat', 'file ', '"file"', 'inherit', 'none', 'null'];
const LETTERS = 'abcdefilmnoprstv "\'';

const keptText = (random: () => number): string =>
  pick(random, [
    () => pick(random, choices.chordStyles).value,
    () => pick(random, choices.placements).value,
    () => pick(random, NEAR),
    () => Array.from({ length: below(random, 9) }, () => pick(random, [...LETTERS])).join(''),
  ])();

const readStyle = (kept: string): string =>
  Option.getOrElse(Schema.decodeUnknownOption(ChordStyle)(kept), () => styleDefault);
const readPlacement = (kept: string): string =>
  Option.getOrElse(Schema.decodeUnknownOption(Placement)(kept), () => placementDefault);

const sources = sourcesAt('https://hymns.cvr.im', []);

describe('Settings’ chord choices are the current hymnal’s', () => {
  it('read the defaults the current settings give', () => {
    expect(styleDefault).toBe('simple');
    expect(placementDefault).toBe('beat');
  });

  it('read any kept text as the current store reads it', () => {
    const random = seeded(17);
    for (let run = 0; run < 500; run++) {
      const kept = keptText(random);
      expect<string>(styleOf(kept)).toBe(readStyle(kept));
      expect<string>(placementOf(kept)).toBe(readPlacement(kept));
    }
  });

  it('answer the current lists’ rows, in order, the kept choice chosen', () => {
    const random = seeded(23);
    withDataHost(() => {
      for (let run = 0; run < 300; run++) {
        const style = keptText(random);
        const placement = keptText(random);
        const rows = sources.settingsChords([style, placement]);
        expect(rows).toEqual(chordChoices(style, placement));
        expect(rows.style).toEqual(
          choices.chordStyles.map((choice, k) => ({
            value: choice.value,
            label: choice.label,
            chosen: choice.value === readStyle(style),
            divided: k > 0,
          })),
        );
        expect(rows.placement).toEqual(
          choices.placements.map((choice, k) => ({
            value: choice.value,
            label: choice.label,
            chosen: choice.value === readPlacement(placement),
            divided: k > 0,
          })),
        );
      }
    });
    expect(choices.chordStyles.map((c) => c.value)).toEqual([...ChordStyle.literals]);
    expect(choices.placements.map((c) => c.value)).toEqual([...Placement.literals]);
  });

  it('declares to Exact what the source exports', () => {
    const held: typeof ChoicesDecl = {
      chordStyles: choices.chordStyles,
      placements: choices.placements,
    };
    expect(held.chordStyles).toBe(choices.chordStyles);
    expect(held.placements).toBe(choices.placements);
  });
});
