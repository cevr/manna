import * as BunServices from '@effect/platform-bun/BunServices';
import { decodePng } from '@manna/film/tools';
import { Effect, FileSystem, Option, Result } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import {
  type Box,
  cropOf,
  linesOf,
  type Palette,
  paintsOf,
  shareOf,
  splitSheet,
} from '../../../library/storybook/sheet.ts';
import { PALETTES } from './palettes.ts';

const NONE: Palette = { ink: '#000000', parts: [] };
const VILLAGERS = PALETTES.get('idea-villagers') ?? NONE;
const CHILD = PALETTES.get('villager-child') ?? NONE;
const TODDLER = PALETTES.get('villager-toddler') ?? NONE;

/** The kept lineup of the villagers at every age, one scale: `idea-villagers`' kept poses sheet (views 1 to 6, left to right). */
const LINEUP = `${import.meta.dir}/../cast/idea-villagers/cast-sheet/kept/poses.png`;

/** Each figure's box on the lineup: the grown villager standing (view 6), the child (view 5), the toddler sitting (view 2) and the baby (view 4). */
const BOXES = {
  grown: { x: 1270, y: 220, width: 240, height: 560 },
  child: { x: 1020, y: 350, width: 250, height: 430 },
  toddler: { x: 300, y: 480, width: 220, height: 300 },
  baby: { x: 800, y: 530, width: 190, height: 250 },
} as const satisfies Record<string, Box>;

/** How far a declared share may lie from the one the lineup measures. */
const WITHIN = 0.03;

describe('head shares', () => {
  it.effect(
    'each age declares the share of a grown head the kept lineup measures, crown to collar (each box split as a one-cell sheet and read as the store reads a cell), within 3 %',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const lineup = yield* Effect.fromResult(decodePng(yield* fs.readFile(LINEUP)));
        const paints = paintsOf(VILLAGERS);
        const head = (box: Box) =>
          Option.getOrElse(
            Option.flatMap(
              Option.fromUndefinedOr(
                Result.getOrUndefined(splitSheet(cropOf(lineup, box), 1, VILLAGERS))?.cells[0],
              ),
              (cell) => Option.flatMap(linesOf(cell.raster, paints), (l) => l.head),
            ),
            () => 0,
          );
        const grown = head(BOXES.grown);
        expect(grown).toBeGreaterThan(100);
        const measured = {
          child: head(BOXES.child) / grown,
          toddler: head(BOXES.toddler) / grown,
          baby: head(BOXES.baby) / grown,
        };
        const declared = {
          child: shareOf(CHILD, 'iio-milk'),
          toddler: shareOf(TODDLER, 'iio-milk'),
          baby: shareOf(VILLAGERS, 'iio-milk-baby'),
        };
        for (const age of ['child', 'toddler', 'baby'] as const)
          expect(Math.abs(declared[age] - measured[age])).toBeLessThanOrEqual(
            WITHIN * measured[age],
          );
        expect(shareOf(VILLAGERS, 'iio-milk')).toBe(1);
      }).pipe(Effect.provide(BunServices.layer)),
  );
});
