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

import { isTab, type TabGroup, type TabSource, tabGroups } from '../home/tabs.ts';

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

/** The group of `groups` whose slug `rest` opens with, the longest such (a slug and its `-2` both may). */
const groupBySlug = (groups: ReadonlyArray<TabGroup>, rest: string): number => {
  let found = -1;
  groups.forEach((group, at) => {
    const fits = rest === group.slug || rest.startsWith(`${group.slug}-`);
    if (fits && (found < 0 || group.slug.length > (groups[found]?.slug.length ?? 0))) found = at;
  });
  return found;
};

/** The group a row of the list's own (`hymn-`, `star-`) belongs to: by its slug for a repeat, else the first group that lists the hymn. */
const groupOfRow = (groups: ReadonlyArray<TabGroup>, rest: string): number => {
  if (/^\d+$/u.test(rest)) {
    const n = Number(rest);
    return groups.findIndex((group) => group.numbers.includes(n) && !group.repeats.includes(n));
  }
  return groupBySlug(groups, rest);
};

/** The group of the list's box `id` (a group's header, `section-<slug>` or `group-<slug>`, or one of its rows, `hymn-<n>`, `hymn-<slug>-<n>`); -1 for any other box. */
const groupOfBox = (groups: ReadonlyArray<TabGroup>, id: string): number => {
  const [kind = '', ...parts] = id.split('-');
  const rest = parts.join('-');
  if (kind === 'section' || kind === 'group') return groupBySlug(groups, rest);
  if (kind === 'hymn' || kind === 'star') return groupOfRow(groups, rest);
  return -1;
};

/**
 * The tile of the group the home list of tab `name` shows at its top, as
 * the current app's All at once opens at (`AllAtOnce.tsx` `at`): `ids` name
 * the list's boxes from its top edge down, and the first that is a group's
 * header or row names it (the pinned header has no id of its own, so the
 * first row under it does); the list's head, the Recent shelf or no such
 * box at all is the first tile.
 */
export const tileAt = (
  source: TabSource,
  name: string,
  ids: ReadonlyArray<string>,
  favourites: ReadonlyArray<number>,
  recent: ReadonlyArray<number>,
): number => {
  const groups = tabGroups(source, name, favourites, recent);
  for (const id of ids) {
    if (id === 'list-top' || id.startsWith('shelf-')) return 0;
    const at = groupOfBox(groups, id);
    if (at >= 0) return at;
  }
  return 0;
};

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
