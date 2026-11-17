/* oxlint-disable effect/noAsyncFunction, effect/noNewError, effect/noNullish, effect/noTernary, effect/noThrowStatement -- Exact's app folder cannot import effect (docs/exact.md): the test awaits each answer in turn, as the host asks them, over a stand-in server and a storage that answers at once. */

/**
 * The readers and their sources, over made-up packs at the canon's own
 * places: each source runs inside `withDataHost` through the one
 * downloader. Before a pack is on the phone each answers `have` false (and
 * the words still with their offsets); a corrupt pack is never kept; once a
 * pack lands its answers are the made-up pack's, a reference read as at
 * most 3 verses of text; an update is read under its new mark. Nothing is
 * split at import, one verse splits one chapter, one entry one block.
 * And for every verse of the canon, the shown words' offsets cut exactly
 * that word out of the verse and cover it but for the spaces.
 */

import { describe, expect, it } from 'bun:test';
import { withDataHost } from '@manna/exact-kit/data-host/testing';

import { packSources } from '../packs/sources';
import { textOf, textVerses } from '../text/text';
import { CANON_CHAPTERS, canonChapters, chapterIndex } from './canon';
import { lexiconParts, type LexiconLine } from './lexicon';
import { studyBodyOf, studyPackOf, type StudyPack } from './pack';
import { entryRead, studySplits, wordsRead, XREF_VERSES } from './read';
import { STUDY_LEXICON, STUDY_PACKS, STUDY_TAGS, STUDY_XREFS, studySources } from './sources';
import { tagsChapterText, tagsVerseText } from './tags';
import { xrefsChapterText } from './xrefs';

const STORE = { forget: () => {} };

/** A chapter pack of `CANON_CHAPTERS` parts, `at` set at the chapter of `book` `chapter`. */
const chapterPack = (book: number, chapter: number, part: string): StudyPack =>
  studyPackOf(
    Array.from({ length: CANON_CHAPTERS }, (_, index) =>
      index === chapterIndex(book, chapter) ? part : '',
    ),
  );

/** John 3: verse 16 with 7 references (the pack keeps 6), one a range of 5 verses, one a range that ends before it starts; verse 17 with none. */
const XREFS = chapterPack(
  43,
  3,
  xrefsChapterText([
    ...Array.from({ length: 15 }, () => []),
    [
      { book: 45, chapter: 5, verse: 8, last: 12 },
      { book: 1, chapter: 11, verse: 32, last: 1 },
      { book: 62, chapter: 4, verse: 9, last: 9 },
      { book: 43, chapter: 1, verse: 29, last: 29 },
      { book: 66, chapter: 1, verse: 5, last: 5 },
      { book: 40, chapter: 9, verse: 13, last: 13 },
      { book: 42, chapter: 2, verse: 14, last: 14 },
    ],
  ]),
);

const john316 = textOf({ book: 43, chapter: 3, first: 16, last: 16 }).verses[0]?.text ?? '';
const john316Words = john316.split(' ').length;

/** John 3:16 tagged: every word a number, the fourth G25, the second added; the other verses bare. */
const TAGS = chapterPack(
  43,
  3,
  tagsChapterText([
    ...Array.from({ length: 15 }, () => ''),
    tagsVerseText(
      Array.from({ length: john316Words }, (_, index) => ({
        added: index === 1,
        numbers:
          index === 3 ? [25] : [1000 + index, 2000 + index, 3000 + index].slice(0, 1 + (index % 3)),
      })),
    ),
  ]),
);

const line = (def: string): LexiconLine => ({
  lemma: 'ἀγαπάω',
  xlit: 'agapáō',
  pron: "ag-ap-ah'-o",
  def,
  total: 3,
  renders: [{ word: 'love', count: 3 }],
});

const LEXICON = studyPackOf(
  lexiconParts(
    Array.from({ length: 1200 }, (_, index) => (index === 999 ? line('h') : undefined)),
    Array.from({ length: 30 }, (_, index) => (index === 24 ? line('g') : undefined)),
  ),
);

/** A stand-in egw.cvr.im serving `served`'s bodies by path; none answers 404. */
const serverOf = (served: Map<string, string>) => ({
  fetcher: async (url: string) => {
    const body = served.get(new URL(url).pathname);
    if (body === undefined) return { status: 404, text: async () => '' };
    return { status: 200, text: async () => body };
  },
});

/** A storage like Exact's: no file is `ENOENT`. */
const storageOf = () => {
  const files = new Map<string, ArrayBuffer>();
  return {
    files,
    fs: {
      readFile: async (path: string) => {
        const file = files.get(path);
        if (file === undefined) throw Object.assign(new Error('no file'), { code: 'ENOENT' });
        return file;
      },
      atomicWriteFile: async (path: string, bytes: Uint8Array) => {
        files.set(path, Uint8Array.from(bytes).buffer);
      },
    },
  };
};

const served = (packs: { xrefs?: string; tags?: string; lexicon?: string }) =>
  new Map(
    [
      [STUDY_XREFS.path, packs.xrefs],
      [STUDY_TAGS.path, packs.tags],
      [STUDY_LEXICON.path, packs.lexicon],
    ].filter((entry): entry is [string, string] => entry[1] !== undefined),
  );

/** One launch over a stand-in server: the downloader with the study packs, and their readers. */
const launch = (server: ReturnType<typeof serverOf>) => {
  const downloader = packSources({
    setting: 'http://127.0.0.1:4801',
    packs: STUDY_PACKS,
    fetcher: server.fetcher,
  });
  return { ...downloader, reader: studySources(downloader) };
};

const versionIn = (kept: string, name: string) =>
  new RegExp(`(?:^|\\n)${name} (\\S*)`, 'u').exec(kept)?.[1] ?? '';

describe('the sources, through the one downloader', () => {
  it('answer have false before the packs, keep no corrupt pack, then read the landed packs and an update', async () => {
    const storage = storageOf();
    const offline = launch(serverOf(new Map()));
    const none = await withDataHost(() =>
      offline.reader.studyXrefs([43, 3, 16, ''], STORE, storage),
    );
    expect(none).toEqual({ have: false, refs: [] });
    const bare = await withDataHost(() =>
      offline.reader.studyWords([43, 3, 16, ''], STORE, storage),
    );
    expect(bare.have).toBe(false);
    expect(bare.words.length).toBe(john316Words);
    expect(bare.words.every((word) => word.numbers.length === 0)).toBe(true);
    expect(
      (await withDataHost(() => offline.reader.studyEntry(['G25', ''], STORE, storage))).have,
    ).toBe(false);
    const offlineAsk = await withDataHost(() =>
      offline.sources.packsAsk(['', false, 1000], STORE, storage),
    );
    expect(offlineAsk.failed).toBe(true);
    expect(storage.files.size).toBe(0);

    const corrupt = studyBodyOf(TAGS).replace('"parts":["', '"parts":["x');
    const partly = launch(
      serverOf(served({ xrefs: studyBodyOf(XREFS), tags: corrupt, lexicon: studyBodyOf(LEXICON) })),
    );
    const answer = await withDataHost(() =>
      partly.sources.packsAsk(['', false, 2000], STORE, storage),
    );
    expect(answer.failed).toBe(true);
    expect([...storage.files.keys()].sort()).toEqual([STUDY_LEXICON.file, STUDY_XREFS.file].sort());
    const xrefsMark = versionIn(answer.kept, 'xrefs');
    expect(xrefsMark).toBe(XREFS.version);
    expect(versionIn(answer.kept, 'tags')).toBe('');

    const refs = await withDataHost(() =>
      partly.reader.studyXrefs([43, 3, 16, xrefsMark], STORE, storage),
    );
    expect(refs.have).toBe(true);
    expect(refs.refs.map(({ book, chapter, verse, last }) => [book, chapter, verse, last])).toEqual(
      [
        [45, 5, 8, 12],
        [1, 11, 32, 32],
        [62, 4, 9, 9],
        [43, 1, 29, 29],
        [66, 1, 5, 5],
        [40, 9, 13, 13],
      ],
    );
    const romans = textOf({ book: 45, chapter: 5, first: 8, last: 8 + XREF_VERSES - 1 });
    expect(refs.refs[0]?.text).toBe(romans.verses.map((verse) => verse.text).join(' '));
    expect(refs.refs[0]?.reference).toContain('5:8');
    expect(
      await withDataHost(() => partly.reader.studyXrefs([43, 3, 17, xrefsMark], STORE, storage)),
    ).toEqual({ have: true, refs: [] });

    const entry = await withDataHost(() =>
      partly.reader.studyEntry(['G25', versionIn(answer.kept, 'lexicon')], STORE, storage),
    );
    expect(entry).toEqual({
      ...line('g'),
      renders: [...line('g').renders],
      have: true,
      found: true,
      number: 'G25',
      language: 'Greek',
    });

    const fixed = launch(serverOf(served({ tags: studyBodyOf(TAGS) })));
    const again = await withDataHost(() =>
      fixed.sources.packsAsk([answer.kept, true, 3000], STORE, storage),
    );
    const tagsMark = versionIn(again.kept, 'tags');
    expect(tagsMark).toBe(TAGS.version);
    const words = await withDataHost(() =>
      fixed.reader.studyWords([43, 3, 16, tagsMark], STORE, storage),
    );
    expect(words.have).toBe(true);
    expect(words.words.length).toBe(john316Words);
    expect(words.words[3]?.numbers).toEqual(['G25']);
    expect(words.words[1]?.added).toBe(true);
    expect(words.words[2]?.numbers.length).toBe(3);
    const counts = await withDataHost(() =>
      fixed.reader.studyCounts([43, 3, xrefsMark, tagsMark], STORE, storage),
    );
    expect(counts.xrefsHave && counts.wordsHave).toBe(true);
    expect(counts.verses[15]).toEqual({ verse: 16, xrefs: 6, words: john316Words });
    expect(counts.verses[16]).toEqual({ verse: 17, xrefs: 0, words: 0 });
    expect(counts.verses.length).toBe(textVerses(43, 3).length);
  });
});

describe('the readers', () => {
  it('split nothing when a pack is made, one chapter for a verse, one block for an entry', () => {
    const before = studySplits.length;
    const pack = studyPackOf(TAGS.parts);
    expect(studySplits.length).toBe(before);
    wordsRead(pack, 43, 3, 16);
    wordsRead(pack, 43, 3, 17);
    expect(studySplits.slice(before)).toEqual([`tags:${chapterIndex(43, 3)}`]);
    const lexicon = studyPackOf(LEXICON.parts);
    entryRead(lexicon, 'G25');
    entryRead(lexicon, 'G3');
    entryRead(lexicon, 'H1000');
    expect(studySplits.slice(before + 1)).toEqual(['lexicon:4', 'lexicon:2']);
  });

  it('a number the lexicon lacks is not found, its language from its letter; a malformed one has none', () => {
    expect(entryRead(LEXICON, 'H1000')).toMatchObject({
      found: true,
      language: 'Hebrew',
      def: 'h',
    });
    expect(entryRead(LEXICON, 'H999')).toMatchObject({
      have: true,
      found: false,
      language: 'Hebrew',
    });
    expect(entryRead(LEXICON, 'G9999')).toMatchObject({ found: false, language: 'Greek' });
    expect(entryRead(LEXICON, 'X1')).toMatchObject({ found: false, language: '' });
  });

  it('a verse outside the canon answers empty', () => {
    expect(wordsRead(TAGS, 66, 23, 1)).toEqual({ have: true, words: [] });
    expect(wordsRead(TAGS, 43, 3, 99)).toEqual({ have: true, words: [] });
  });

  it("every verse's words cut exactly themselves out of its text, and cover it but for the spaces", () => {
    let verses = 0;
    const wrong: Array<string> = [];
    for (const [book, chapter] of canonChapters()) {
      textVerses(book, chapter).forEach((text, at) => {
        const words = wordsRead(undefined, book, chapter, at + 1).words;
        verses++;
        const cut = words.every((word) => text.slice(word.start, word.end) === word.text);
        const covers =
          words.map((word) => word.text).join(' ') === text && words.at(-1)?.end === text.length;
        if (!cut || !covers) wrong.push(`${book}.${chapter}.${at + 1}`);
      });
    }
    expect(wrong).toEqual([]);
    expect(verses).toBe(31_102);
  });
});
