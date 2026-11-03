import type { Cue, DialName } from '~/feel/cue';

export const DETENT = 52;

export const DECAY = 0.955;

export const FRAME = 16;

export const FLING_CAP = 3000;

const CREEP = 20;

export const MOST_FRAMES = Math.ceil(Math.log(CREEP / FLING_CAP) / Math.log(DECAY)) + 1;

export interface Detents {
  readonly name: DialName;
  readonly count: number;
  readonly wrap: boolean;
}

export interface Rest {
  readonly at: number;
  readonly index: number;
  readonly frames: number;
  readonly crossed: ReadonlyArray<number>;
  readonly cues: ReadonlyArray<Cue>;
}

export const ownDetent = (dial: Detents, n: number): number => {
  'worklet';
  if (dial.wrap) return ((n % dial.count) + dial.count) % dial.count;
  return Math.min(Math.max(n, 0), dial.count - 1);
};

export type Axis = 'row' | 'column';

export const along = (axis: Axis, x: number, y: number): number => {
  'worklet';
  if (axis === 'column') return y;
  return x;
};

export const detentAt = (place: number): number => {
  'worklet';
  return Math.round(place / DETENT);
};

const end = (dial: Detents): number => {
  'worklet';
  return (dial.count - 1) * DETENT;
};

export const dragTo = (dial: Detents, place: number) => {
  'worklet';
  if (dial.wrap) return { place, wall: false };
  const held = Math.min(Math.max(place, 0), end(dial));
  return { place: held, wall: held !== place };
};

export const passed = (dial: Detents, before: number, now: number): ReadonlyArray<number> => {
  'worklet';
  const step = Math.sign(now - before);
  return Array.from({ length: Math.abs(now - before) }, (_, k) =>
    ownDetent(dial, before + step * (k + 1)),
  );
};

export const glide = (dial: Detents, place: number, speed: number): Rest => {
  'worklet';
  const from = detentAt(dragTo(dial, place).place);
  let at = dragTo(dial, place).place;
  let v = Math.min(Math.max(speed, -FLING_CAP), FLING_CAP);
  let frames = 0;
  let wall = false;
  while (Math.abs(v) >= CREEP && !wall) {
    const moved = dragTo(dial, at + (v * FRAME) / 1000);
    at = moved.place;
    wall = moved.wall;
    v *= DECAY;
    frames += 1;
  }
  const rest = detentAt(at);
  const crossed = passed(dial, from, rest);
  const cues: Array<Cue> = crossed.map((n) => ({ _tag: 'detent', dial: dial.name, at: n }));
  if (wall) cues.push({ _tag: 'wall' });
  return { at: rest * DETENT, index: ownDetent(dial, rest), frames: frames + 1, crossed, cues };
};

export const ringOf = (dial: Detents, span: number): number => {
  'worklet';
  if (!dial.wrap) return 0;
  const turn = dial.count * DETENT;
  return Math.max(1, Math.ceil((Math.max(span, 0) + 2 * DETENT) / turn)) * turn;
};

export const slotOf = (n: number, place: number, ring: number): number => {
  'worklet';
  const x = n * DETENT - place;
  if (ring <= 0) return x;
  return x - ring * Math.floor((x + ring / 2) / ring);
};

export const placeOf = (dial: Detents, now: number, index: number): number => {
  'worklet';
  if (!dial.wrap) return ownDetent(dial, index) * DETENT;
  const here = detentAt(now);
  const turn =
    ((((index - here) % dial.count) + dial.count + Math.floor(dial.count / 2)) % dial.count) -
    Math.floor(dial.count / 2);
  return (here + turn) * DETENT;
};
