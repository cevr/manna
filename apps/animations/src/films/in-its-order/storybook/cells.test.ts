import * as BunCrypto from '@effect/platform-bun/BunCrypto';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Layer } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { SHEETS } from './sheets.ts';
import { sheetsMisses } from './testing.ts';

/** The feast table's sheets: every courtyard sheet but the diners' (`cells-diners.test.ts`) and the parchment's (`cells-milk.test.ts`). */
const TABLE = SHEETS.filter((s) => !s.id.startsWith('iio-milk') && !s.id.startsWith('iio-diner'));

describe('In Its Order act 1: the feast table’s sheets as the film draws them', () => {
  it.effect(
    'holds each sheet’s cells module to its record and declaration: its keys in order, each PNG the recorded one, each entry as the store reads the cell',
    () =>
      Effect.gen(function* () {
        expect(TABLE.length).toBe(5);
        expect(yield* sheetsMisses(TABLE)).toEqual([]);
      }).pipe(Effect.provide(Layer.merge(BunServices.layer, BunCrypto.layerDigest))),
  );
});
