import * as BunCrypto from '@effect/platform-bun/BunCrypto';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Layer } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { SHEETS } from './sheets.ts';
import { sheetsMisses } from './testing.ts';

/** The four diners' sheets (`iio-diner-*`); `cells.test.ts` holds the feast table's. */
const DINERS = SHEETS.filter((s) => s.id.startsWith('iio-diner'));

describe('In Its Order act 1: the diners’ sheets as the film draws them', () => {
  it.effect(
    'holds each sheet’s cells module to its record and declaration: its keys in order, each PNG the recorded one, each entry as the store reads the cell',
    () =>
      Effect.gen(function* () {
        expect(DINERS.length).toBe(4);
        expect(yield* sheetsMisses(DINERS)).toEqual([]);
      }).pipe(Effect.provide(Layer.merge(BunServices.layer, BunCrypto.layerDigest))),
  );
});
