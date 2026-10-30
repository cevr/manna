// Which kinds a cast render draws (`renderedKinds`): a kind the ask names is
// drawn or refused, never dropped because the table draws none of it.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Schema } from 'effect';
import type { CastModule, CutoutView } from '../canvas/cast.ts';
import { CastSheetRecord } from '../core/cast-record.ts';
import { renderedKinds } from './cast-kinds.ts';

/** A cut-out view with one bare part: enough for the table to name it. */
const view: CutoutView = {
  box: [0, 0, 16, 16],
  at: [8, 8],
  puppet: {
    key: 'block',
    size: [16, 16],
    parts: [{ name: 'body', png: 'block/body.png' }],
    skeleton: { bones: [], skin: {} },
    origin: [8, 8],
  },
  pose: { numbers: {}, root: [8, 8], scale: 1 },
};

/** A table that cuts the lead's front turnaround and no pose. */
const table: CastModule = {
  CUTOUT: { lead: { turnaround: { front: view } } },
  SHEETS: { lead: { turnaround: { width: 64, height: 64, scale: 1 } } },
  PAPER: { base: '#faf4ec', tone: '#e8dccb', seed: 1 },
};

const kept = (name: string) => ({
  try: 1,
  why: 'kept',
  views: [{ view: 1, name, box: [0, 0, 16, 16] as const }],
});

/** The lead kept a front turnaround and a first pose. */
const record = Schema.decodeSync(CastSheetRecord)({
  member: 'lead',
  scope: 'film',
  who: 'Him',
  refs: [],
  sheets: {},
  kept: { turnaround: kept('front'), poses: kept('poses-1') },
});

describe('renderedKinds', () => {
  it.effect('an asked kind with no cut-out views refuses', () =>
    Effect.gen(function* () {
      const refused = yield* Effect.flip(
        renderedKinds(
          'lead',
          table,
          record,
          { kinds: [], views: ['turnaround-front', 'poses-poses-1'] },
          'cutout',
        ),
      );
      expect(refused._tag).toBe('CastRenderRefused');
      expect(refused.message).toContain('poses-poses-1');
    }),
  );

  it.effect('a kind asked by name with no cut-out views refuses', () =>
    Effect.gen(function* () {
      const refused = yield* Effect.flip(
        renderedKinds('lead', table, record, { kinds: ['poses'], views: [] }, 'cutout'),
      );
      expect(refused.message).toContain('draws no poses view');
    }),
  );

  it.effect('an ask that names no kind draws the kinds the table cuts', () =>
    Effect.gen(function* () {
      expect(
        yield* renderedKinds('lead', table, record, { kinds: [], views: [] }, 'cutout'),
      ).toEqual(['turnaround']);
    }),
  );
});
