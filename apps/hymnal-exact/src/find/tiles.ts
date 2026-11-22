/* oxlint-disable effect/noTernary, effect/noNullish -- Exact's data module imports no effect (docs/exact.md), so a row's id is a plain branch and a group past the tiles is a plain `undefined`. */

/**
 * All at once's tiles, as the current app's (`home/AllAtOnce.tsx`): one
 * tile a group of the tab in use, each its group's name, its count, the
 * strip of where its hymns lie, whether it holds the hymn the player has,
 * and its name as VoiceOver reads it, all by the current app's `tilesFor`,
 * `tileCount` and `tileName`. Each tile also names the row its tap lands
 * at the list's top: its group's first hymn's row, by the id the home list
 * gives it (`features/list.contract`: `hymn-<n>`, or `hymn-<slug>-<n>` for a
 * hymn a group above lists too, `listRowId`).
 */

import { type Tab, tileCount, tileName, tilesFor } from '@manna/hymnal-app/home/tabs';

import { isTab, type TabSource, tabGroups } from '../home/tabs.ts';

export interface TileSpan {
  readonly start: number;
  readonly end: number;
}

export interface GroupTile {
  readonly index: number;
  readonly name: string;
  readonly count: string;
  readonly label: string;
  readonly spans: Array<TileSpan>;
  readonly playing: boolean;
  /** The id of the group's first row in the home list. */
  readonly row: string;
}

/** The tiles of tab `name` over the reader's lists, `playing` the player's hymn (0 while idle); none for a name that is no tab. */
export const groupTiles = (
  source: TabSource,
  name: string,
  favourites: ReadonlyArray<number>,
  recent: ReadonlyArray<number>,
  playing: number,
): Array<GroupTile> => {
  if (!isTab(name)) return [];
  const groups = tabGroups(source, name, favourites, recent);
  const tab: Tab = {
    name,
    groups: groups.map((group) => ({ name: group.name, hymns: group.numbers })),
  };
  const tiles = tilesFor(tab, playing);
  return groups.flatMap((group, at) => {
    const tile = tiles[at];
    const first = group.numbers[0];
    if (tile === undefined || first === undefined) return [];
    return [
      {
        index: tile.index,
        name: tile.name,
        count: tileCount(tile),
        label: tileName(tile),
        spans: tile.spans.map((span) => ({ start: span.start, end: span.end })),
        playing: tile.playing,
        row: group.repeats.includes(first) ? `hymn-${group.slug}-${first}` : `hymn-${first}`,
      },
    ];
  });
};
