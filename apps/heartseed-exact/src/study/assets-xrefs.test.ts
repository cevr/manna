/* oxlint-disable effect/noNullish -- Exact's app folder cannot import effect (docs/exact.md): a test over plain records. */

/**
 * The cross-references pack against its asset, the whole Bible: every
 * verse's answer is the asset's first 6 for it, in its order, each naming a
 * verse the canon has; the asset holds no verse the app's text lacks; and
 * the reader answers a few verses with their words.
 */

import { describe, expect, it } from 'bun:test';

import { assetXrefs } from '../../tools/study';
import { appSource, verseCounts } from '../test/study-assets';
import { buildXrefs } from './build';
import { studyPackOf } from './pack';
import { xrefsRead } from './read';
import { XREFS_KEPT, xrefsOfVerse, xrefsVerses, type XrefPlace } from './xrefs';

const asset = assetXrefs();
const source = appSource();
const counts = verseCounts();
/** References as one comparable line, every field written. */
const placesText = (places: ReadonlyArray<XrefPlace>) =>
  places.map((place) => `${place.book} ${place.chapter} ${place.verse} ${place.last}`).join(';');

const pack = studyPackOf(buildXrefs({ ...source, xrefs: (key) => asset.get(key) ?? [] }));

describe('the cross-references pack, against cross-refs.json', () => {
  it("every verse answers the asset's first 6, in order, each a verse the canon has", () => {
    const wrong: Array<string> = [];
    const outside: Array<string> = [];
    let refs = 0;
    source.canon.forEach(([book, chapter], index) => {
      const read = xrefsVerses(pack.parts[index] ?? '');
      for (let verse = 1; verse <= (counts.get(`${book}.${chapter}`) ?? 0); verse++) {
        const key = `${book}.${chapter}.${verse}`;
        const places = xrefsOfVerse(read[verse - 1] ?? '');
        refs += places.length;
        const expected = (asset.get(key) ?? []).slice(0, XREFS_KEPT);
        if (placesText(places) !== placesText(expected)) wrong.push(key);
        for (const place of places)
          if (place.verse > (counts.get(`${place.book}.${place.chapter}`) ?? 0))
            outside.push(`${key} ${place.book}.${place.chapter}.${place.verse}`);
      }
    });
    expect(wrong).toEqual([]);
    expect(outside).toEqual([]);
    expect(refs).toBeGreaterThan(150_000);
    expect(pack.count).toBe(1189);
  });

  it("the asset names one verse the app's text lacks, 3 John 1:15, which the KJV keeps in 1:14", () => {
    const missing = [...asset.keys()].filter((key) => {
      const [book, chapter, verse] = key.split('.');
      return Number(verse) > (counts.get(`${book}.${chapter}`) ?? 0);
    });
    expect(missing).toEqual(['64.1.15']);
  });

  it('John 3:16 has 6, read with their words, and Revelation 22:21 and a verse outside the canon answer', () => {
    const john = xrefsRead(pack, 43, 3, 16);
    expect(john.refs.length).toBe(6);
    expect(john.refs.every((ref) => ref.text.length > 0 && ref.reference !== '')).toBe(true);
    expect(xrefsRead(pack, 66, 22, 21).have).toBe(true);
    expect(xrefsRead(pack, 66, 23, 1)).toEqual({ have: true, refs: [] });
  });
});
