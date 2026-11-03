import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Result } from 'effect';
import { type Address, resolveAddress } from '../core/address.ts';
import { layout } from '../core/layout.ts';
import type { HandMark } from '../core/export-handle.ts';
import { LOOK_STEP } from './look.ts';
import { Looker } from './looker.ts';
import { emptyLedger, fakeRenderHost, testExportInfo } from './browser/testing.ts';
import { holdScenes, holdTimings, testFilm } from './film-repo/testing.ts';

const film = testFilm(holdScenes, holdTimings);
const heldFrame = (i: number) => Math.round(i / (LOOK_STEP * testExportInfo.fps)) % 2;

const POP_FRAME = 20;
const hand = (i: number): HandMark => ({
  scene: 'held',
  side: 'far',
  x: 980 + 120 * Number(i >= POP_FRAME),
  y: 500,
  sx: 940,
  sy: 480,
  tx: 1100,
  ty: 500,
  size: 44,
  radius: 240,
  reach: Number(i >= POP_FRAME),
  grip: { open: 0, hold: 1, point: 0, palm: 0 },
  formed: Number(i >= POP_FRAME),
  inside: true,
  over: false,
  alpha: 1,
});

const setup = () => {
  const ledger = emptyLedger();
  const layer = Looker.layer.pipe(
    Layer.provide(
      fakeRenderHost(ledger, {
        looked: (i) => ({
          grey: 100 + 100 * heldFrame(i),
          faces: [{ scene: 'held', x: 0, y: 0, size: 500, alpha: 1, order: 0 }],
          hands: [hand(i)],
        }),
      }),
    ),
  );
  const look = (address: Address) =>
    Effect.gen(function* () {
      const scope = Result.getOrThrow(
        resolveAddress(
          {
            name: 'test',
            placed: Result.getOrThrow(layout(holdScenes, holdTimings, 30)),
            look: Option.none(),
            shorts: [],
          },
          address,
        ),
      );
      return yield* (yield* Looker).look(film, 2, scope, Option.none());
    }).pipe(Effect.provide(layer));
  return { ledger, look };
};

describe('Looker', () => {
  it.live('measures every scene of the film and closes what it opened', () =>
    Effect.gen(function* () {
      const { ledger, look } = setup();
      const looked = yield* look({ _tag: 'Film' });
      expect(looked.height).toBe(testExportInfo.height);
      expect(looked.looks.map((l) => l.scene)).toEqual(['held', 'brief', 'ambient']);
      for (const l of looked.looks) expect([l.seconds > 0, l.held]).toEqual([true, 0]);
      expect(looked.looks.map((l) => l.face)).toEqual([500, 0, 0]);
      expect(ledger.server).toEqual({ started: 1, stopped: 1 });
      expect(ledger.browser).toEqual({ launched: 1, closed: 1 });
      expect(ledger.pages.closed).toBe(ledger.pages.opened);
    }),
  );

  it.live('with scenes given, draws and reports only those', () =>
    Effect.gen(function* () {
      const { look } = setup();
      const looked = yield* look({ _tag: 'Scenes', ids: ['brief'] });
      expect(looked.looks.map((l) => l.scene)).toEqual(['brief']);
    }),
  );

  it.live('draws every frame across a change of a hand and finds the frame it jumps on', () =>
    Effect.gen(function* () {
      const { look } = setup();
      const looked = yield* look({ _tag: 'Film' });
      expect(looked.jumps.map((j) => [j.scene, j.side, j.what])).toEqual([
        ['held', 'far', 'place'],
      ]);
      expect(looked.jumps[0]?.T).toBeCloseTo(POP_FRAME / testExportInfo.fps, 9);
      expect(looked.far).toEqual([]);
      expect(looked.hidden.map((h) => [h.scene, h.side])).toEqual([['held', 'far']]);
    }),
  );
});
