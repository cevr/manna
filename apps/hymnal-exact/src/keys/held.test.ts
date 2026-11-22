/**
 * The declarations Exact's type check reads in place of the current app's
 * key button model, press and wheel times (`src/keys/decl/*.d.ts`, mapped by
 * the app's `tsconfig.json`; the workspace's typecheck reads the sources)
 * stay true to them: each source export the port's tests read is assigned to
 * its declaration, so the repo's type check of this file fails the day a
 * source drifts from what the port was told; and each is there at run time.
 * The contract's hold and reset wait are One's `HOLD` and `RESET_WAIT`,
 * and `keysPlaces`' measures are read from One's files.
 */

import { expect, test } from 'bun:test';

import * as thumb from '@manna/hymnal-app/player/thumb';
import * as wheel from '@manna/hymnal-app/player/wheel';
import * as motion from '@manna/hymnal-app/player/wheelmotion';

import { styleIn } from '@manna/exact-kit/look/testing';

import { appFile, oneFile } from '../look/design.testing.ts';
import type * as ThumbDecl from './decl/thumb';
import type * as WheelDecl from './decl/wheel';
import type * as MotionDecl from './decl/wheelmotion';
import { PLACES } from './sources.ts';

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
    isStill: thumb.isStill,
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

/** The milliseconds of the `after(…)` under `features/keys.contract`'s task `name`. */
const afterOf = (name: string): number => {
  const found = new RegExp(`\\n  task ${name} when [^\\n]*\\n    after\\((\\d+), `, 'u').exec(
    appFile('features/keys.contract'),
  );
  expect(found).not.toBeNull();
  return Number(found?.[1]);
};

/** A number constant a One file declares, exported or not. */
const constant = (path: string, name: string): number => {
  const found = new RegExp(`^(?:export )?const ${name} = (\\d+(?:\\.\\d+)?);$`, 'mu').exec(
    oneFile(path),
  );
  expect(found).not.toBeNull();
  return Number(found?.[1]);
};

/** A style's number property in a One file. */
const styled = (path: string, style: string, prop: string): number =>
  Number(styleIn(oneFile(path), style)?.get(prop));

test('the key button’s hold and the reset’s wait are the current app’s times', () => {
  expect(afterOf('keysHold')).toBe(wheel.HOLD);
  expect(afterOf('keysResetWait')).toBe(thumb.RESET_WAIT);
});

test('the key button lets go in 200 ms on the strong ease-out, still under Reduce Motion', () => {
  const press = /transition=\(motionStill \? "none" : "scale ([\w.-]+) ([\w.-]+)"\)/u.exec(
    appFile('features/keys.contract'),
  );
  expect([press?.[1], press?.[2]]).toEqual(['duration.press', 'easing.out']);
  expect(appFile('app.forma')).toContain('  duration.press = 200ms\n');
});

test('the key button’s, the dials’ and the wheel’s measures are the current app’s', () => {
  const [key, dials, view, bar] = [
    'src/player/KeyButton.tsx',
    'src/player/Dials.tsx',
    'src/player/DialView.tsx',
    'src/player/PlayerBar.tsx',
  ];
  expect(PLACES).toEqual({
    detent: constant('src/player/dial.ts', 'DETENT'),
    pad: constant('src/player/DialPanel.tsx', 'PANEL_PAD'),
    rowGap: constant('src/player/DialPanel.tsx', 'ROW_GAP'),
    side: constant(bar, 'SIDE'),
    gap: constant(bar, 'PANEL_GAP'),
    title: constant(view, 'TITLE'),
    titlePad: styled(view, 'title', 'paddingLeft'),
    notch: styled(view, 'notch', 'height'),
    notchWide: styled(view, 'notch', 'width'),
    home: styled(dials, 'home', 'width'),
    homeLow: styled(dials, 'home', 'bottom'),
    key: constant(key, 'HEIGHT'),
    keyLeft: styled(key, 'button', 'paddingLeft'),
    keyRight: styled(key, 'button', 'paddingRight'),
    keyGap: styled(key, 'button', 'gap'),
    ring: constant(key, 'RING'),
    ringGap: constant(key, 'RING_GAP'),
    rest: constant('src/player/bar.ts', 'REST'),
    seeker: styled('src/player/Scrubber.ios.tsx', 'bar', 'height'),
    originX: wheel.ORIGIN_X,
    itemWide: wheel.ITEM.width,
    itemHigh: wheel.ITEM.height,
    itemPad: styled('src/player/KeyWheel.tsx', 'pill', 'paddingHorizontal'),
    lift: wheel.LIFT,
    dim: styled(key, 'dim', 'opacity'),
    pressed: constant(key, 'PRESSED_IN'),
    backdrop: motion.BACKDROP.opacity,
    overSpacing: styled(key, 'over', 'letterSpacing'),
    titleSpacing: styled(view, 'title', 'letterSpacing'),
  });
});
