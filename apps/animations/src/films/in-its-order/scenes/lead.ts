import { act, blink, idle, lag } from '@manna/film/core';

export const ARM_LIMIT = 15;

export const HEAD_LIMIT = 4;

const LEAD_IDLE = idle(1);

export interface Cues {
  readonly raise: number;
  readonly landed: number;
  readonly turn: number;
  readonly smile: number;
  readonly read: number;
}

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

export const eyesOf = (c: Cues) => blink(1, [c.turn, c.smile, c.read]);

export const restingOf = (t: number) => {
  const { sway, breath, drift, tilt } = LEAD_IDLE(t);
  return {
    lean: sway + 1.2 * breath + 0.6 * drift,
    neck: 0.35 * 0.5 * tilt,
    head: 0.65 * 0.5 * tilt,
  };
};

export const restingEyes = blink(1);

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
