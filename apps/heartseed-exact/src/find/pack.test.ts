/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noTernary, effect/noTryCatch -- Exact's app folder cannot import effect (docs/exact.md); the test parses and compares the pack as JSON, picks a word's verses by a plain branch, removes its scratch folder whatever happens, and writes the pack to a scratch file and reads it back, as `bun tools/find.ts` writes it. */

/**
 * The word index as the writer writes it (spec acceptance 4), to a scratch
 * file and read back: every word's verses, decoded, are the verses the
 * model's own scan finds for that word (by its list, or by its bitmap where
 * the verse table holds its places); the stop words are the words in more
 * than a quarter of all verses; the file is under 2 MB; and writing the
 * same pack twice writes once.
 */

import { expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeFind } from '../../tools/find';
import { corpus } from '../../tools/kjv';
import { modelStops, modelText, modelVerses } from '../test/find-model';
import { findIndexOf } from './index';
import { hasBit, type FindPack } from './pack';

const MOST_BYTES = 2_000_000;

const verses = modelVerses();
const model = modelText(verses);

it('writes a pack whose every word holds the verses the model finds, its stop words over a quarter, under 2 MB, and once', () => {
  const folder = mkdtempSync(join(tmpdir(), 'heartseed-find-'));
  const file = join(folder, 'find.gen.json');
  try {
    expect(writeFind(file, corpus())).toBe(true);
    expect(writeFind(file, corpus())).toBe(false);
    expect(statSync(file).size).toBeLessThan(MOST_BYTES);
    const pack = JSON.parse(readFileSync(file, 'utf8')) as FindPack;
    expect([...pack.stops].sort()).toEqual(modelStops(verses));
    const index = findIndexOf(pack);
    const wrong: Array<string> = [];
    for (const word of model.vocabulary) {
      const expected = model.versesOf.get(word) ?? [];
      const tabled = pack.tabled.indexOf(word);
      const got =
        tabled >= 0
          ? verses.flatMap((_, verse) => (hasBit(pack.marks[tabled] ?? '', verse) ? [verse] : []))
          : [...new Set(index.listOf(word).all().map(index.verseOf))];
      if (!index.holds(word) || JSON.stringify(got) !== JSON.stringify(expected)) wrong.push(word);
    }
    expect(wrong).toEqual([]);
    expect(Object.keys(pack.letters).flatMap(index.wordsFrom)).toEqual([...model.vocabulary]);
  } finally {
    rmSync(folder, { recursive: true });
  }
});
