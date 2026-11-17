/* oxlint-disable effect/noAs, effect/noAsyncFunction, effect/noGlobals, effect/noNullish, effect/noTernary, effect/noTryCatch -- Exact's app folder cannot import effect (docs/exact.md): a data source is a promise, the driver's pack is fetched once with the data host's fetch and parsed as the pack its writer wrote, and no pack is undefined, which a failed fetch also gives. */

/**
 * Find's data source, as `app.ts` registers it: `findRead(query, limit)`
 * over the word index pack, which the app downloads and never bundles
 * (q126). Until a pack is here, find still answers the place a query
 * names, and says that word search is downloading (`DOWNLOADING_LINE`).
 *
 * The pack comes from `packFrom` (`findPackFrom`, `src/study/sources.ts`):
 * the one downloader's kept `words` pack, read under its version, which
 * `features/find.contract` passes as `mark` so an index downloaded after
 * the first query is read; or, in a driver's launch, the file
 * `tools/drive-find.ts` serves at the origin `HEARTSEED_FIND_PACK` names
 * (`app.ts`). Either is asked once per mark and decoded as far as the
 * queries ask.
 */

import type { FileStorage } from '@manna/exact-kit/storage';

import type { ExactStore } from '../packs/sources';
import { findWith, placesOnly, type FindShown } from './find';
import { findIndexOf } from './index';
import type { FindPack } from './pack';

/** Where a pack comes from, for the kept index's version (`mark`, empty for none) and the app's storage: the pack, or none yet. */
export type PackFrom = (mark: string, storage: FileStorage) => Promise<FindPack | undefined>;

/** The pack served at `origin` (`<origin>/find.json`), fetched once; none when there is no origin or the fetch fails. */
export const packAt =
  (origin: string): PackFrom =>
  async () => {
    if (origin === '') return undefined;
    try {
      const answer = await fetch(`${origin}/find.json`);
      if (!answer.ok) return undefined;
      return (await answer.json()) as FindPack;
    } catch {
      return undefined;
    }
  };

/** Find's sources over the pack `packFrom` gives for the kept index's version (`mark`), asked once per mark, at the first query under it. */
export const findSources = (packFrom: PackFrom) => {
  let reading:
    | {
        readonly mark: string;
        readonly read: Promise<((query: string, limit: number) => FindShown) | undefined>;
      }
    | undefined;
  const reader = (mark: string, storage: FileStorage) => {
    if (reading?.mark !== mark)
      reading = {
        mark,
        read: packFrom(mark, storage).then((pack) =>
          pack === undefined ? undefined : findWith(findIndexOf(pack)),
        ),
      };
    return reading.read;
  };
  return {
    findRead: async (
      [query, limit, mark]: readonly [string, number, string],
      _store: ExactStore,
      storage: FileStorage,
    ): Promise<FindShown> => {
      const read = await reader(mark, storage);
      return read === undefined ? placesOnly(query) : read(query, limit);
    },
  };
};
