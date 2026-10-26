// The committed `figures.riv` is the build of these rigs: the project the
// house prints from IIO's figures file (`FIGURES`) is the one its stamp
// (`figures.stamp.json`) says it was built from, and the file is the one
// that build wrote (`unbuilt`). A rig edited without a rebuild
// (`bun src/films/in-its-order/rigs/build.ts`) fails here, on a host with no
// Rive CLI too. No figure of IIO is locked yet (a lock follows the owner's
// keep of its cast render), so none is held to a lock and no override frees
// one; any override cites the owner's word on IIO's ledger (`unsaid`). How a
// lock and an override are held are the house's
// (`packages/film/src/style/lock.test.ts`, `override.test.ts`).

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import { figureOverrides, figuresRml, lockedPrints } from '@manna/film/style';
import { unbuilt, unlocked, unsaid } from '@manna/film/style/build';
import { LEDGER, MAIN } from './build.ts';
import { FIGURES } from './figures.ts';

const here = import.meta.dir;

describe("IIO's figures", () => {
  it.effect.layer(BunServices.layer)('are the build of their rigs', () =>
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

  it.effect.layer(BunServices.layer)('hold no lock yet, and break none', () =>
    Effect.gen(function* () {
      const locked = lockedPrints(FIGURES);
      expect(locked).toEqual([]);
      const held = yield* unlocked(LEDGER, locked);
      expect(held.broken).toEqual([]);
    }),
  );

  it.effect.layer(BunServices.layer)("every override on them cites the owner's word", () =>
    Effect.gen(function* () {
      expect(yield* unsaid(LEDGER, figureOverrides(FIGURES))).toEqual([]);
    }),
  );
});
