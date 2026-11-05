import { Option, Schema } from 'effect';
import {
  type Box,
  deltaE,
  measuredPaint,
  Palette,
  rgbOfHex,
} from '../../../library/storybook/sheet.ts';
import type { Raster } from '@manna/film/tools';
import FEAST_GUEST_MAN from '../../../library/cast/feast-guest-man/cast-sheet/palette.json' with { type: 'json' };
import FEAST_GUEST_WOMAN from '../../../library/cast/feast-guest-woman/cast-sheet/palette.json' with { type: 'json' };
import FILLER_DRESSED from '../../../library/cast/filler-dressed/cast-sheet/palette.json' with { type: 'json' };
import LEAD_FEAST from '../../../library/cast/lead-feast/cast-sheet/palette.json' with { type: 'json' };
import VILLAGER_CHILD from '../../../library/cast/villager-child/cast-sheet/palette.json' with { type: 'json' };
import VILLAGER_TODDLER from '../../../library/cast/villager-toddler/cast-sheet/palette.json' with { type: 'json' };
import FEAST_MOTHER from '../cast/feast-mother/cast-sheet/palette.json' with { type: 'json' };
import IDEA_VILLAGERS from '../cast/idea-villagers/cast-sheet/palette.json' with { type: 'json' };

const decode = Schema.decodeUnknownSync(Palette);

/** Each member act 1 casts, its palette as its `palette.json` holds it, decoded once. */
export const PALETTES: ReadonlyMap<string, Palette> = new Map([
  ['lead-feast', decode(LEAD_FEAST)],
  ['feast-guest-man', decode(FEAST_GUEST_MAN)],
  ['feast-guest-woman', decode(FEAST_GUEST_WOMAN)],
  ['filler-dressed', decode(FILLER_DRESSED)],
  ['villager-child', decode(VILLAGER_CHILD)],
  ['villager-toddler', decode(VILLAGER_TODDLER)],
  ['feast-mother', decode(FEAST_MOTHER)],
  ['idea-villagers', decode(IDEA_VILLAGERS)],
]);

/** A paint a member's palette (or one of its sheets' props) takes that no look gives a hex for: read on the member's own drawing, in a box on a flat patch of it, as the ink is. */
export interface MeasuredPaint {
  readonly member: string;
  readonly hex: string;
  /** The drawing it is read on, from the member's folder: a drawn sheet (`shot-sheets/<id>/sheet.png`) or a kept view (`cast-sheet/views/<view>.png`). */
  readonly source: string;
  readonly box: Box;
  /** What the drawing paints in it. */
  readonly what: string;
}

/** How far (ΔE76) a measured paint may lie from what its box reads now: the ink's bound. */
export const MEASURE_BOUND = 2;

/** Every measured paint act 1's palettes take, each with the drawing and box it is read in. */
export const MEASURED: ReadonlyArray<MeasuredPaint> = [
  {
    member: 'feast-mother',
    hex: '#ca7c65',
    source: 'shot-sheets/iio-baby/sheet.png',
    box: { x: 186, y: 180, width: 8, height: 20 },
    what: "her hair (left of her face, first figure); the baby's hair and her stool are drawn the same terracotta",
  },
  {
    member: 'feast-mother',
    hex: '#5b6190',
    source: 'shot-sheets/iio-baby/sheet.png',
    box: { x: 230, y: 640, width: 60, height: 120 },
    what: "her dress's main colour (her lap, first figure)",
  },
  {
    member: 'filler-dressed',
    hex: '#b6502e',
    source: 'shot-sheets/iio-diner-3/sheet.png',
    box: { x: 1310, y: 326, width: 18, height: 8 },
    what: "the older man's open mouth in `talk` (iio-diner-3's prop)",
  },
  {
    member: 'lead-feast',
    hex: '#fcebb4',
    source: 'shot-sheets/iio-table/sheet.png',
    box: { x: 970, y: 345, width: 20, height: 30 },
    what: "the baby's bottle he holds up in `bottle` (iio-table's prop; asked as #f3e3a0)",
  },
  {
    member: 'lead-feast',
    hex: '#f2dec8',
    source: 'cast-sheet/views/front.png',
    box: { x: 122, y: 430, width: 12, height: 30 },
    what: "his sash's hanging tail in his kept front view: the sash's light, which iio-close's drawn sash is split to (iio-close's paint)",
  },
];

/** Each of `hexes` a member's palette takes that neither its `look` (lowercased) gives nor one of its `measured` paints declares. */
export const unsourced = (
  member: string,
  hexes: ReadonlyArray<string>,
  look: string,
  measured: ReadonlyArray<MeasuredPaint>,
): ReadonlyArray<string> =>
  hexes.filter(
    (h) =>
      !look.includes(h.toLowerCase()) &&
      !measured.some((m) => m.member === member && m.hex.toLowerCase() === h.toLowerCase()),
  );

/** How far a measured paint lies from what its box reads on `drawing`, when past `MEASURE_BOUND`; none when it holds. */
export const measureMiss = (drawing: Raster, paint: MeasuredPaint): Option.Option<number> =>
  Option.liftPredicate(
    deltaE(measuredPaint(drawing, paint.box), rgbOfHex(paint.hex)),
    (d) => d > MEASURE_BOUND,
  );
