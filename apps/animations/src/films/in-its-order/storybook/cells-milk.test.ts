import * as BunCrypto from '@effect/platform-bun/BunCrypto';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Layer } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { SHEETS } from './sheets.ts';
import { sheetsMisses } from './testing.ts';

/** The parchment's sheets (`iio-milk*`); `cells.test.ts` holds the courtyard's. */
const PARCHMENT = SHEETS.filter((s) => s.id.startsWith('iio-milk'));

describe('In Its Order act 1: the parchment sheets as the film draws them', () => {
  it.effect(
    'holds each sheet’s cells module to its record and declaration: its keys in order, each PNG the recorded one, each entry as the store reads the cell',
    () =>
      Effect.gen(function* () {
        expect(PARCHMENT.length).toBe(5);
        expect(yield* sheetsMisses(PARCHMENT)).toEqual([]);
      }).pipe(Effect.provide(Layer.merge(BunServices.layer, BunCrypto.layerDigest))),
  );
});
