/* oxlint-disable effect/noAsyncFunction, effect/noNewPromise -- Exact's data module answers a Promise, and its app folder cannot import effect (docs/exact.md): the counts read their two packs at once. */

/**
 * The study packs as the one downloader keeps them (`src/packs`, q126), and
 * their readers' sources. Each source takes the kept version of the packs
 * it reads (`packView`'s `version`, its `mark`), so a new pack is read
 * again: `studyCounts(book, chapter, xrefsMark, tagsMark)`,
 * `studyXrefs(book, chapter, verse, mark)`,
 * `studyWords(book, chapter, verse, mark)` and `studyEntry(number, mark)`.
 */

import type { FileStorage } from '@manna/exact-kit/storage';

import type { ExactStore, packSources } from '../packs/sources';
import type { PackSpec } from '../packs/spec';
import { CANON_CHAPTERS } from './canon';
import { studyCheckOf, type StudyPack } from './pack';
import {
  countsRead,
  entryRead,
  wordsRead,
  xrefsRead,
  type StudyCounts,
  type StudyEntry,
  type StudyWords,
  type StudyXrefs,
} from './read';

/** OpenBible.info's cross-references, each verse's first 6, as egw.cvr.im serves them. */
export const STUDY_XREFS: PackSpec<StudyPack> = {
  name: 'xrefs',
  path: '/api/study/xrefs',
  file: 'app:/data/xrefs.json',
  title: 'the cross-references',
  noun: 'Cross-references',
  waiting:
    'The cross-references are still on their way. They need a connection once, then they work offline.',
  check: studyCheckOf(CANON_CHAPTERS),
};

/** The Hebrew and Greek behind each word of the KJV, as egw.cvr.im serves them. */
export const STUDY_TAGS: PackSpec<StudyPack> = {
  name: 'tags',
  path: '/api/study/tags',
  file: 'app:/data/tags.json',
  title: 'the Hebrew and Greek words',
  noun: 'Hebrew and Greek words',
  waiting:
    'The Hebrew and Greek words are still on their way. They need a connection once, then they work offline.',
  check: studyCheckOf(CANON_CHAPTERS),
};

/** Strong's dictionaries, with how the KJV renders each word, as egw.cvr.im serves them. */
export const STUDY_LEXICON: PackSpec<StudyPack> = {
  name: 'lexicon',
  path: '/api/study/lexicon',
  file: 'app:/data/lexicon.json',
  title: "Strong's dictionary",
  noun: "Strong's dictionary",
  waiting:
    "Strong's dictionary is still on its way. It needs a connection once, then it works offline.",
  check: studyCheckOf(),
};

/** The study packs, in the order the downloader asks them. */
export const STUDY_PACKS = [STUDY_XREFS, STUDY_TAGS, STUDY_LEXICON] as const;

/** The downloader the study packs are read through. */
type Packs = Pick<ReturnType<typeof packSources>, 'packOf'>;

/** The study packs' reader sources over `packs`. */
export const studySources = (packs: Packs) => ({
  studyCounts: async (
    [book, chapter, xrefsMark, tagsMark]: readonly [number, number, string, string],
    _store: ExactStore,
    storage: FileStorage,
  ): Promise<StudyCounts> => {
    const [xrefs, tags] = await Promise.all([
      packs.packOf(STUDY_XREFS, xrefsMark, storage),
      packs.packOf(STUDY_TAGS, tagsMark, storage),
    ]);
    return countsRead(xrefs, tags, book, chapter);
  },
  studyXrefs: async (
    [book, chapter, verse, mark]: readonly [number, number, number, string],
    _store: ExactStore,
    storage: FileStorage,
  ): Promise<StudyXrefs> =>
    xrefsRead(await packs.packOf(STUDY_XREFS, mark, storage), book, chapter, verse),
  studyWords: async (
    [book, chapter, verse, mark]: readonly [number, number, number, string],
    _store: ExactStore,
    storage: FileStorage,
  ): Promise<StudyWords> =>
    wordsRead(await packs.packOf(STUDY_TAGS, mark, storage), book, chapter, verse),
  studyEntry: async (
    [number, mark]: readonly [string, string],
    _store: ExactStore,
    storage: FileStorage,
  ): Promise<StudyEntry> => entryRead(await packs.packOf(STUDY_LEXICON, mark, storage), number),
});
