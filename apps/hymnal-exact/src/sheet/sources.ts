/* oxlint-disable effect/noNullish -- Exact's data module cannot import effect (docs/exact.md): a hymn the bundle has no chords for is undefined. */

/**
 * The player sheet's sources, as `app.ts` registers them over the shipped
 * chords (`chords.gen.ts`, decoded only for the hymn asked):
 *
 * - `sheetPlacement(n, kept, global)`: the placement dial for hymn `n`
 *   (`placementDialOf`), shown only for a hymn with chords, as the current
 *   `PlacementDial` returns nothing for one without;
 * - `sheetPlace(kept, n, own)`: the kept own placements with hymn `n` at
 *   `own` (`keptWith`), `inherit` taking its entry out.
 */

import { decodeHymn, hasChords } from '@manna/hymnal-app/hymns/chords';

import { keptWith, placementDialOf } from './placement.ts';

export const sheetSources = (bundled: ReadonlyArray<readonly [number, string]>) => {
  const encoded = new Map(bundled);
  const chorded = (number: number): boolean => {
    const text = encoded.get(number);
    if (text === undefined) return false;
    const decoded = decodeHymn(text);
    return decoded._tag === 'Some' && hasChords(decoded.value);
  };
  return {
    sheetPlacement: ([number, kept, global]: readonly [number, ReadonlyArray<string>, string]) =>
      placementDialOf(kept, number, global, chorded(number)),
    sheetPlace: ([kept, number, own]: readonly [ReadonlyArray<string>, number, string]) => ({
      kept: keptWith(kept, number, own),
    }),
  };
};
