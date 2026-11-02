// The lead's acting at the feast table, as bone numbers on his single-9
// cut-out (`cold.ts` draws him): his lean all through, his idle in his joints
// from the raise's landing, his head on the cues and the bottle arm's settle,
// each joint inside the limits his cut-out draws clean at.

import { act, blink, idle, lag } from '@manna/film/core';

/** The most his bottle arm's bones turn from his single-9 view, degrees: at 25 the cuff breaks. */
export const ARM_LIMIT = 15;

/**
 * The most his head part turns from his single-9 view, degrees: its skin
 * turns it by 0.35 of his neck and 0.65 of his head bone, and at 5 to 6 his
 * collar's outline steps.
 */
export const HEAD_LIMIT = 4;

/** The lead's idle, seed 1 (the mother's is seed 2): his breath, sway, head tilt and weight drift. */
const LEAD_IDLE = idle(1);

/** The cues he acts on, scene s: his raise's start, its landing on k6, and the starts of `turn`, `smile` and `read`. */
export interface Cues {
  readonly raise: number;
  readonly landed: number;
  readonly turn: number;
  readonly smile: number;
  readonly read: number;
}

/**
 * His lean, degrees clockwise on screen: his whole cut-out turned about his
 * hip, his raise's keys with it (`raising`). His idle's sway, breath and drift
 * run all through. On the raise his weight dips
 * away from the bottle arm first (anticipation), goes over to it, and settles
 * back once the bottle is up.
 */
export const leanOf = (c: Cues) => {
  const acting = act(0, [
    { at: c.raise - 0.25, dur: 0.6, to: -1.2, anticipate: 0.5 },
    { at: c.raise + 0.45, dur: 0.8, to: 0 },
  ]);
  return (t: number) => {
    const { sway, breath, drift } = LEAD_IDLE(t);
    return acting(t) + sway + 0.4 * breath + 0.6 * drift;
  };
};

/**
 * His eyes, 0 open to 1 shut: his blinks, seed 1 (the mother's is seed 2),
 * and one more as his head turns on `turn`, `smile` and `read`, each that
 * lies half a second or more from his own.
 */
export const eyesOf = (c: Cues) => blink(1, [c.turn, c.smile, c.read]);

/**
 * His bone numbers at rest, the bottle on his lap under his raise's rest key
 * (the title): his idle's sway, drift and breath in his lean (his breath
 * deep, as the mother's, to read at the title's pulled-back framing), and half its
 * tilt in his neck and head (about 1 degree, inside `HEAD_LIMIT`). His bottle
 * arm stays at 0 under the key.
 */
export const restingOf = (t: number) => {
  const { sway, breath, drift, tilt } = LEAD_IDLE(t);
  return {
    lean: sway + 1.2 * breath + 0.6 * drift,
    neck: 0.35 * 0.5 * tilt,
    head: 0.65 * 0.5 * tilt,
  };
};

/** His eyes at rest, 0 open to 1 shut: his own blinks, seed 1, with no cue. */
export const restingEyes = blink(1);

/**
 * His bone numbers, degrees clockwise on screen: his lean (`leanOf`) all
 * through, and his joints from his raise's landing on k6, each at 0 before
 * it, under his raise's keys. k6 is his single-9 view, every bone at 0, and
 * each bone keeps within `ARM_LIMIT` of it: at 25 degrees his bottle arm's
 * cuff breaks. The arm lands still moving, so it carries on up past k6 and
 * settles back with a small bounce, the wrist 80 ms behind and turned against
 * it so the bottle stays upright. His head nods after the lift, glances to
 * the man as the guests turn and stare, tilts to the woman as they smile and
 * comes back to the letter as it falls, his head 60 ms behind his neck; his
 * head's whole turn stays within `HEAD_LIMIT`, past which his collar notches. His
 * idle's breath, drift and tilt come into his joints over 0.8 s from the
 * landing, so the landing from his last key on his drawn arm shows no step.
 */
export const numbersOf = (c: Cues) => {
  const lean = leanOf(c);
  const life = act(0, [{ at: c.landed, dur: 0.8, to: 1 }]);
  const shoulder = act(0, [
    { at: c.landed, dur: 0.14, to: 3 },
    { at: c.landed + 0.14, dur: 0.45, to: 0 },
  ]);
  const elbow = act(0, [
    { at: c.landed, dur: 0.14, to: -5 },
    { at: c.landed + 0.14, dur: 0.5, to: 0, overshoot: 0.2 },
  ]);
  const nod = act(0, [
    { at: c.landed, dur: 0.5, to: -1, overshoot: 0.5 },
    { at: c.turn + 0.15, dur: 0.5, to: -2.2, anticipate: 0.25, overshoot: 0.2 },
    { at: c.smile, dur: 0.6, to: 2.2, anticipate: 0.2, overshoot: 0.2 },
    { at: c.read + 0.1, dur: 0.5, to: -0.5, anticipate: 0.15, overshoot: 0.2 },
  ]);
  const shoulderRight = (t: number) => shoulder(t) + 0.6 * life(t) * LEAD_IDLE(t).breath;
  const elbowRight = (t: number) => elbow(t) + 1.2 * life(t) * LEAD_IDLE(t).drift;
  const wristRight = lag((t) => -0.85 * (shoulderRight(t) + elbowRight(t)), 0.08);
  const neck = (t: number) => nod(t) + 0.5 * life(t) * LEAD_IDLE(t).tilt;
  const head = lag(neck, 0.06);
  return (t: number) => ({
    lean: lean(t),
    neck: 0.35 * neck(t),
    head: 0.65 * head(t),
    shoulderRight: shoulderRight(t),
    elbowRight: elbowRight(t),
    wristRight: wristRight(t),
    shoulderLeft: -0.5 * life(t) * LEAD_IDLE(t).breath,
  });
};
