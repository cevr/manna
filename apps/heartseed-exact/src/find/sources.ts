/* oxlint-disable effect/noAs, effect/noAsyncFunction, effect/noGlobals, effect/noNullish, effect/noTernary, effect/noTryCatch -- Exact's app folder cannot import effect (docs/exact.md): a data source is a promise, the driver's pack is fetched once with the data host's fetch and parsed as the pack its writer wrote, and no pack is undefined, which a failed fetch also gives. */

/**
 * Find's data source, as `app.ts` registers it: `findRead(query, limit)`
 * over the word index pack, which the app downloads and never bundles
 * (q126). Until a pack is here, find still answers the place a query
 * names, and says that word search is downloading (`DOWNLOADING_LINE`).
 *
 * The pack comes from `packFrom`: the downloader's kept file once
 * `hs-study-packs` hands it over; until then only a driver's launch has
 * one, the file `tools/drive-find.ts` serves at the origin
 * `HEARTSEED_FIND_PACK` names (`app.ts`), fetched once at the first query
 * and decoded as far as the queries ask.
 */

import { findWith, placesOnly, type FindShown } from './find';
import { findIndexOf } from './index';
import type { FindPack } from './pack';

/** Where a pack comes from: the pack, or none yet. */
export type PackFrom = () => Promise<FindPack | undefined>;

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

/** Find's sources over the pack `packFrom` gives, asked once, at the first query. */
export const findSources = (packFrom: PackFrom) => {
  let reading: Promise<((query: string, limit: number) => FindShown) | undefined> | undefined;
  const reader = () => {
    reading ??= packFrom().then((pack) =>
      pack === undefined ? undefined : findWith(findIndexOf(pack)),
    );
    return reading;
  };
  return {
    findRead: async ([query, limit]: readonly [string, number]): Promise<FindShown> => {
      const read = await reader();
      return read === undefined ? placesOnly(query) : read(query, limit);
    },
  };
};
