import * as BunServices from '@effect/platform-bun/BunServices';
import * as BunCrypto from '@effect/platform-bun/BunCrypto';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer } from 'effect';
import { figureOverrides, figuresRml, lockedPrints } from '@manna/film/style';
import { unbuilt, unlocked, unsaid } from '@manna/film/style/build';
import { LEDGER, MAIN } from './build.ts';
import { FIGURES } from './figures.ts';

const here = import.meta.dir;

describe("IIO's figures", () => {
  it.effect.layer(Layer.merge(BunServices.layer, BunCrypto.layerDigest))(
    'are the build of their rigs',
    () =>
      Effect.gen(function* () {
        const stale = yield* unbuilt({
          riv: `${here}/figures.riv`,
          stamp: `${here}/figures.stamp.json`,
          rml: figuresRml(FIGURES),
          main: MAIN,
        });
        expect(stale).toEqual([]);
      }),
  );

  it.effect.layer(Layer.merge(BunServices.layer, BunCrypto.layerDigest))(
    'hold no lock yet, and break none',
    () =>
      Effect.gen(function* () {
        const locked = lockedPrints(FIGURES);
        expect(locked).toEqual([]);
        const held = yield* unlocked(LEDGER, locked);
        expect(held.broken).toEqual([]);
      }),
  );

  it.effect.layer(Layer.merge(BunServices.layer, BunCrypto.layerDigest))(
    "every override on them cites the owner's word",
    () =>
      Effect.gen(function* () {
        expect(yield* unsaid(LEDGER, figureOverrides(FIGURES))).toEqual([]);
      }),
  );
});
