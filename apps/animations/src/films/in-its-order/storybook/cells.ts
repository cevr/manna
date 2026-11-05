import type { SheetCells, Sheets } from '../../../library/storybook/scene.ts';
import { CELLS as FILLER_1 } from '../../../library/cast/filler-dressed/shot-sheets/iio-diner-1/cells.ts';
import { CELLS as FILLER_2 } from '../../../library/cast/filler-dressed/shot-sheets/iio-diner-2/cells.ts';
import { CELLS as FILLER_3 } from '../../../library/cast/filler-dressed/shot-sheets/iio-diner-3/cells.ts';
import { CELLS as FILLER_4 } from '../../../library/cast/filler-dressed/shot-sheets/iio-diner-4/cells.ts';
import { CELLS as GUEST_MAN } from '../../../library/cast/feast-guest-man/shot-sheets/iio-table/cells.ts';
import { CELLS as GUEST_WOMAN } from '../../../library/cast/feast-guest-woman/shot-sheets/feast-courtyard/cells.ts';
import { CELLS as GUEST_WOMAN_TABLE } from '../../../library/cast/feast-guest-woman/shot-sheets/iio-table/cells.ts';
import { CELLS as LEAD_CLOSE } from '../../../library/cast/lead-feast/shot-sheets/iio-close/cells.ts';
import { CELLS as LEAD_MILK } from '../../../library/cast/lead-feast/shot-sheets/iio-milk/cells.ts';
import { CELLS as LEAD_TABLE } from '../../../library/cast/lead-feast/shot-sheets/iio-table/cells.ts';
import { CELLS as CHILD_MILK } from '../../../library/cast/villager-child/shot-sheets/iio-milk/cells.ts';
import { CELLS as TODDLER_MILK } from '../../../library/cast/villager-toddler/shot-sheets/iio-milk/cells.ts';
import { CELLS as MOTHER_BABY } from '../cast/feast-mother/shot-sheets/iio-baby/cells.ts';
import { CELLS as VILLAGER_BABY } from '../cast/idea-villagers/shot-sheets/iio-milk-baby/cells.ts';
import { CELLS as VILLAGER_MILK } from '../cast/idea-villagers/shot-sheets/iio-milk/cells.ts';
import { withProps } from '../../../library/storybook/sheet.ts';
import { PALETTES } from './palettes.ts';
import { sheetNamed } from './sheets.ts';

/** Each drawn sheet's cells module, by `<member>/<sheet>`. */
const CELLS: ReadonlyArray<readonly [string, string, SheetCells['cells']]> = [
  ['lead-feast', 'iio-table', LEAD_TABLE],
  ['lead-feast', 'iio-close', LEAD_CLOSE],
  ['lead-feast', 'iio-milk', LEAD_MILK],
  ['feast-mother', 'iio-baby', MOTHER_BABY],
  ['feast-guest-man', 'iio-table', GUEST_MAN],
  ['feast-guest-woman', 'feast-courtyard', GUEST_WOMAN],
  ['feast-guest-woman', 'iio-table', GUEST_WOMAN_TABLE],
  ['filler-dressed', 'iio-diner-1', FILLER_1],
  ['filler-dressed', 'iio-diner-2', FILLER_2],
  ['filler-dressed', 'iio-diner-3', FILLER_3],
  ['filler-dressed', 'iio-diner-4', FILLER_4],
  ['idea-villagers', 'iio-milk', VILLAGER_MILK],
  ['idea-villagers', 'iio-milk-baby', VILLAGER_BABY],
  ['villager-toddler', 'iio-milk', TODDLER_MILK],
  ['villager-child', 'iio-milk', CHILD_MILK],
];

/** Every sheet act 1 draws as its film draws it: the member's palette with the props the sheet adds, and each cell's PNG and entry, by `<member>/<sheet>`. */
export const SHEET_CELLS: Sheets = new Map(
  CELLS.flatMap(([member, sheet, cells]) => {
    const palette = PALETTES.get(member);
    if (!palette) return [];
    const props = sheetNamed(member, sheet)?.props ?? [];
    return [[`${member}/${sheet}`, { palette: withProps(palette, props), cells }] as const];
  }),
);
