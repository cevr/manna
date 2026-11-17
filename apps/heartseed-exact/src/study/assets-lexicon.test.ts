/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): a test over plain records. */

/**
 * The lexicon pack against `strongs.json` and the tags, the whole Bible:
 * every entry's fields are the asset's; its total is how often the tags
 * carry it, and its renderings are counted from those words; `language`
 * follows the letter; a number the tags use is found exactly when the
 * asset has it (the asset lacks some, held under the count found when this
 * was written); the longest definition and the entry with the most
 * renderings are read whole.
 */

import { describe, expect, it } from 'bun:test';

import { assetLexicon, assetWords } from '../../tools/study';
import { appSource } from '../test/study-assets';
import { buildLexicon, buildTags, tallyOf, topRenders } from './build';
import { RENDERS_KEPT, type Render } from './lexicon';
import { studyPackOf } from './pack';
import { entryRead } from './read';

/** How many distinct numbers the tags use that `strongs.json` lacks (Greek numbers its dictionary skips). */
const LACKED_CEILING = 751;

const source = appSource();
const words = assetWords();
const tags = buildTags({ ...source, words: (key) => words.get(key) }).parts;
const tally = tallyOf(source, tags);
const lexicon = assetLexicon();
const pack = studyPackOf(buildLexicon(lexicon, tally));
const known = new Set(lexicon.map((entry) => entry.number));

/** Renderings as one comparable line. */
const rendersText = (renders: ReadonlyArray<Render>) =>
  renders.map((render) => `${render.word}:${render.count}`).join(',');

/** Each number's count over the tags pack, read from its tokens here rather than by `tallyOf`. */
const carried = new Map<string, number>();
source.canon.forEach(([book], index) => {
  for (const token of (tags[index] ?? '').split(/[| ]/u)) {
    const body = token.replace(/^~/u, '');
    if (body === '' || body === '-') continue;
    for (const n of body.split('+')) {
      const number = `${book <= 39 ? 'H' : 'G'}${n}`;
      carried.set(number, (carried.get(number) ?? 0) + 1);
    }
  }
});

describe('the lexicon pack, against strongs.json and the tags', () => {
  it("every entry's fields are the asset's, its total and renderings the tags', its language its letter's", () => {
    const wrong: Array<string> = [];
    for (const entry of lexicon) {
      const read = entryRead(pack, entry.number);
      const same =
        read.found &&
        read.lemma === entry.lemma &&
        read.xlit === entry.xlit &&
        read.pron === entry.pron &&
        read.def === entry.def &&
        read.total === (carried.get(entry.number) ?? 0) &&
        rendersText(read.renders) === rendersText(topRenders(tally.words.get(entry.number))) &&
        read.renders.length <= RENDERS_KEPT &&
        read.language === (entry.number.startsWith('H') ? 'Hebrew' : 'Greek');
      if (!same) wrong.push(entry.number);
    }
    expect(wrong).toEqual([]);
    expect(lexicon.length).toBeGreaterThan(13_000);
  });

  it('a number the tags use is found exactly when the asset has it', () => {
    const used = [...tally.totals.keys()];
    const wrong = used.filter((number) => entryRead(pack, number).found !== known.has(number));
    const lacked = used.filter((number) => !known.has(number));
    expect(wrong).toEqual([]);
    expect(lacked.length).toBeLessThanOrEqual(LACKED_CEILING);
    expect(lacked.every((number) => entryRead(pack, number).language !== '')).toBe(true);
  });

  it('the longest definition and the entry with the most renderings read whole', () => {
    const longest = lexicon.reduce((a, b) => (b.def.length > a.def.length ? b : a));
    expect(entryRead(pack, longest.number).def).toBe(longest.def);
    const most = [...tally.words].reduce((a, b) => (b[1].size > a[1].size ? b : a));
    const read = entryRead(pack, most[0]);
    expect(read.renders).toEqual(topRenders(most[1]));
    expect(read.renders.length).toBe(RENDERS_KEPT);
    expect(read.total).toBe(tally.totals.get(most[0]) ?? -1);
  });
});
