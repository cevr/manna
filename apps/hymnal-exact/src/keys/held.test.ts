/**
 * The declarations Exact's type check reads in place of the current app's
 * key button model, press and wheel times (`src/keys/decl/*.d.ts`, mapped by
 * the app's `tsconfig.json`; the workspace's typecheck reads the sources)
 * stay true to them: each source export the port's tests read is assigned to
 * its declaration, so the repo's type check of this file fails the day a
 * source drifts from what the port was told; and each is there at run time.
 */

import { expect, test } from 'bun:test';

import * as thumb from '@manna/hymnal-app/player/thumb';
import * as wheel from '@manna/hymnal-app/player/wheel';
import * as motion from '@manna/hymnal-app/player/wheelmotion';

import type * as ThumbDecl from './decl/thumb';
import type * as WheelDecl from './decl/wheel';
import type * as MotionDecl from './decl/wheelmotion';

/** A module's declaration with each function's parameters compared both ways (TypeScript's method bivariance). */
type Held<T> = {
  [K in keyof T]: T[K] extends (...args: infer P) => infer R
    ? { bivariant(...args: P): R }['bivariant']
    : T[K];
};

const held = {
  thumb: {
    RESET_WAIT: thumb.RESET_WAIT,
    ThumbEvent: thumb.ThumbEvent,
    step: thumb.step,
    transposeTo: thumb.transposeTo,
    chipsOf: thumb.chipsOf,
    shownOf: thumb.shownOf,
    faceOf: thumb.faceOf,
    saidOf: thumb.saidOf,
    hintOf: thumb.hintOf,
    keyStops: thumb.keyStops,
    capoStops: thumb.capoStops,
    capoSaid: thumb.capoSaid,
    keySaid: thumb.keySaid,
  } satisfies Held<typeof ThumbDecl>,
  wheel: {
    HOLD: wheel.HOLD,
    SLOP: wheel.SLOP,
    DEAD: wheel.DEAD,
    ORIGIN_X: wheel.ORIGIN_X,
    ITEM: wheel.ITEM,
    LIFT: wheel.LIFT,
    WORDS: wheel.WORDS,
    itemsOf: wheel.itemsOf,
    slotOf: wheel.slotOf,
    overOf: wheel.overOf,
    WheelEvent: wheel.WheelEvent,
    idle: wheel.idle,
    step: wheel.step,
  } satisfies Held<typeof WheelDecl>,
  motion: {
    BACKDROP: motion.BACKDROP,
    REDUCED: motion.REDUCED,
    EXIT: motion.EXIT,
  } satisfies Held<typeof MotionDecl>,
};

test('every declared export is there at run time', () => {
  for (const module of Object.values(held))
    for (const value of Object.values(module)) expect(value).toBeDefined();
});
