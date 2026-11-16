/* oxlint-disable effect/noNodeBuiltinImport, effect/noTernary -- a Bun test that reads the current hymnal's settings source's text for the default, and decodes as its key-value store does, with its Effect schema. */

/**
 * The Sounds and haptics setting is the current hymnal's `feel` (A3). The
 * current app keeps it as its store's JSON of a boolean; the port keeps its
 * word, `on` or `off`. For any kept text, the port reads its two words as
 * the current app decodes the values they stand for (`true`, `false`), and
 * any other text as the current app's default, read from its source, so a
 * default changed there fails here.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import { Option, Schema } from 'effect';

import { below, pick, seeded } from '../test/random.ts';
import { feelAnswer, feelOf, feels } from './feel.ts';

const settingsSource = readFileSync(
  new URL('../../../hymnal/src/settings.ts', import.meta.url),
  'utf8',
);
const fallback = /setting\('feel', Schema\.Boolean, (true|false)\)/u.exec(settingsSource)?.[1];

/** The current app's store, as its key-value store reads and writes `feel`. */
const stored = Schema.fromJsonString(Schema.toCodecJson(Schema.Boolean));
const decoded = Schema.decodeUnknownOption(stored);
const encoded = Schema.encodeSync(stored);

/** What the current app reads from its store's text `text`: its decoding, else its default. */
const currentOf = (text: string) => Option.getOrElse(decoded(text), () => fallback === 'true');

/** The current store's text for the value a port word stands for. */
const STANDS_FOR = { on: encoded(true), off: encoded(false) } as const;

const NEAR = ['', 'On', 'OFF', ' on', 'off ', '"on"', 'true', 'false', '1', '0', 'null', 'no'];
const LETTERS = 'efnorstu "\'01';

/** Kept text as a store may hold it: a word, a near miss, or letters at random. */
const keptText = (random: () => number): string =>
  pick(random, [
    () => pick(random, feels),
    () => pick(random, NEAR),
    () => Array.from({ length: below(random, 6) }, () => pick(random, [...LETTERS])).join(''),
  ])();

describe('Sounds and haptics is the current hymnal’s feel', () => {
  it('is on by default, as the current app is', () => {
    expect(fallback).toBe('true');
    expect(feelAnswer('')).toEqual({ on: true });
  });

  it('reads its words as the current app decodes their values, any other text as its default', () => {
    const random = seeded(17);
    for (let run = 0; run < 2000; run++) {
      const kept = keptText(random);
      const named = kept === 'on' || kept === 'off';
      const want = named ? currentOf(STANDS_FOR[kept]) : fallback === 'true';
      expect({ kept, on: feelAnswer(kept).on }).toEqual({ kept, on: want });
      expect(feelOf(kept)).toBe(named ? kept : 'on');
    }
  });
});
