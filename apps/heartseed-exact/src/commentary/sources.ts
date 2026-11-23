/* oxlint-disable effect/noAsyncFunction -- Exact's data module answers a Promise, and its app folder cannot import effect (docs/exact.md). */

/**
 * The commentary as a pack the one downloader keeps (`src/packs`), and its
 * reader's sources: `commentaryRead(book, chapter, mark)` and
 * `commentaryCounts(book, chapter, mark)`, `mark` being the kept version
 * (`commentaryShown.version`), so a new pack is read again.
 */

import type { FileStorage } from '@manna/exact-kit/storage';

import type { ExactStore, packSources } from '../packs/sources';
import type { PackSpec } from '../packs/spec';
import {
  checkPackPaced,
  countsOf,
  readOf,
  type CommentaryCounts,
  type CommentaryPack,
  type CommentaryRead,
} from './pack';

/** Ellen White's Bible Commentary, as egw.cvr.im serves it (`apps/egw-search`, `GET /api/commentary/pack`). */
export const COMMENTARY: PackSpec<CommentaryPack> = {
  name: 'commentary',
  path: '/api/commentary/pack',
  file: 'app:/data/commentary.json',
  title: "Ellen White's commentary",
  noun: 'Commentary',
  waiting: 'The commentary is still on its way. It needs a connection once, then it works offline.',
  check: checkPackPaced,
};

/** The downloader the commentary is read through. */
type Packs = Pick<ReturnType<typeof packSources>, 'packOf'>;

/** The commentary's reader sources over `packs`. */
export const commentarySources = (packs: Packs) => ({
  commentaryRead: async (
    [book, chapter, mark]: readonly [number, number, string],
    _store: ExactStore,
    storage: FileStorage,
  ): Promise<CommentaryRead> =>
    readOf(await packs.packOf(COMMENTARY, mark, storage), book, chapter),
  commentaryCounts: async (
    [book, chapter, mark]: readonly [number, number, string],
    _store: ExactStore,
    storage: FileStorage,
  ): Promise<CommentaryCounts> =>
    countsOf(await packs.packOf(COMMENTARY, mark, storage), book, chapter),
});
