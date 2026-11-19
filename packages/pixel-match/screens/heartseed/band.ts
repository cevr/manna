/**
 * Heartseed's content bands (spec, "Heartseed's content band"; owner, q2:
 * "Keep gear and nav bar"). The port keeps UIKit's navigation bar and tab
 * bar on every Garden screen (home, a list, Today), and One draws its own
 * header row and neither bar, so a Garden row is scored over a band: on the
 * One side from the edge these targets give, read from One's tree at
 * capture, to the picture's foot. The Settings and Add sheets are scored
 * whole; About and Licences, pushed inside the Settings sheet in the port,
 * are banded under their headings (`about.ts`). A row's unit names the
 * port's edges (`exact.band`).
 */
import type { OneBand, Row } from '../../src/model.ts';

/** Home has no header row: its band starts at the greeting's top, the first thing it draws. */
export const HOME_BAND: OneBand = { targets: ['id=greeting'], edge: 'top' };

/** A list's header row is its back link, `Your field`: the band starts under it. */
export const LIST_BAND: OneBand = { targets: ['label=Your field'], edge: 'bottom' };

/** Today's header row is its heading (`Today`, or `The field is tended`) beside `Your field` when shown: the band starts under the lower. */
export const TODAY_BAND: OneBand = {
  targets: ['label=Today', 'label=The field is tended', 'label=Your field'],
  edge: 'bottom',
};

/** `row` scored over `band` on the One side. */
export const banded =
  (band: OneBand) =>
  (row: Row): Row => {
    const one = row.one;
    if (!one) return row;
    return { ...row, one: { ...one, band } };
  };
