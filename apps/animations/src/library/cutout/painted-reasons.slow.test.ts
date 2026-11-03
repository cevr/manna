import { Effect } from 'effect';
import { expect, it } from 'effect-bun-test';
import { cutViews } from './views.ts';
import { paintedArms } from './limb-census.ts';
import { LIMB_LIMITS } from './skeleton.ts';

it.effect('every painted arm has typed failing conditions and its restorable declaration', () =>
  Effect.gen(function* () {
    const views = yield* cutViews;
    for (const spec of views)
      for (const out of paintedArms(spec)) {
        expect(Array.isArray(out.reason)).toBe(true);
        expect(out.reason.length).toBeGreaterThan(0);
        expect(out.limb.part).toBe(out.part);
        for (const reason of out.reason) {
          expect(reason.bound).toBe(LIMB_LIMITS[reason.measure]);
          expect(Number.isFinite(reason.elbow) && Number.isFinite(reason.wrist)).toBe(true);
        }
      }
  }),
);
