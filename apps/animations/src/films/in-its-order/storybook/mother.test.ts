import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import {
  clearBackground,
  cropOf,
  drawnNearestOf,
  groundOf,
  paintsOf,
  rgbOfHex,
  snapped,
  tidiedReport,
} from '../../../library/storybook/sheet.ts';
import { pngIn } from './cast-files.ts';
import { SHEET_CELLS } from './cells.ts';
import { PALETTES } from './palettes.ts';

describe("the mother's sheet", () => {
  /** Her first figure's head (hair, face, the baby's head) and the stool's left legs, in her sheet's px. */
  const BOXES = [
    { x: 140, y: 60, width: 260, height: 300 },
    { x: 30, y: 700, width: 90, height: 220 },
  ] as const;

  it.effect(
    'splits with no skin pixel repainted past SNAP_RADIUS (critique 1, item 2: her terracotta hair and stool turned cream)',
    () =>
      Effect.gen(function* () {
        const sheet = yield* pngIn('feast-mother', 'shot-sheets/iio-baby/sheet.png');
        const ground = groundOf(sheet);
        const paints = paintsOf(PALETTES.get('feast-mother') ?? { ink: '#000000', parts: [] });
        const far = BOXES.map((box) => {
          const drawn = clearBackground(cropOf(sheet, box), ground);
          const nearest = drawnNearestOf(drawn, paints);
          return tidiedReport(drawn, snapped(drawn, paints, nearest), paints, nearest).skinFar;
        });
        expect(far).toEqual([0, 0]);
      }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect(
    "takes her head share as her head (the veil's peak to the collar) over her bare head (her hair's crown to the collar) on her cup cell, within 0.02, so her face draws at the table's width (critique 1, item 2)",
    () =>
      Effect.gen(function* () {
        const cup = yield* pngIn('feast-mother', 'shot-sheets/iio-baby/cells/cup.png');
        const head = SHEET_CELLS.get('feast-mother/iio-baby')?.cells['cup']?.head ?? 0;
        const hair = rgbOfHex('#ca7c65');
        const rowOf = (hit: (q: number) => boolean) =>
          Array.from({ length: cup.height }, (_, y) => y).find((y) =>
            Array.from({ length: cup.width }, (_, x) => y * cup.width + x).some(hit),
          ) ?? 0;
        const top = rowOf((q) => (cup.rgba[q * 4 + 3] ?? 0) > 0);
        const crown = rowOf((q) => hair.every((c, k) => cup.rgba[q * 4 + k] === c));
        const bare = top + head - (crown - 1);
        expect(
          Math.abs((PALETTES.get('feast-mother')?.head ?? 1) - head / bare),
        ).toBeLessThanOrEqual(0.02);
      }).pipe(Effect.provide(BunServices.layer)),
  );
});
