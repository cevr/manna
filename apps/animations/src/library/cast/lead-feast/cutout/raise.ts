// The lead's raise: his front cut-out from rest to poses-1 (the bottle raised)
// in 48 frames at 24 fps, a big move drawn from keys (`raise/record.json`):
// his own sleeve at rest, then K2-K6 drawn over clip B's frames (`raise-cut.ts`), each
// laid in place of his `armRight` and turned about its pivot as clip B's motion
// says (`raise/motion.json`: each frame's key and turn, on twos); the kept hand
// and bottle of poses-1 laid over at the key's hand, turned with it; the boil
// on twos. A frame is a function of its index alone.

import type { CutoutEase, CutoutEaseFrame, PuppetLook } from '@manna/film/canvas';
import { Array as Arr, Option, Record as Rec, Schema } from 'effect';
import heldPoses1 from './raise/held/poses-1.png' with { type: 'file' };
import k2 from './raise/keys/k2.png' with { type: 'file' };
import k3 from './raise/keys/k3.png' with { type: 'file' };
import k4 from './raise/keys/k4.png' with { type: 'file' };
import k5 from './raise/keys/k5.png' with { type: 'file' };
import k6 from './raise/keys/k6.png' with { type: 'file' };
import rest from './raise/keys/rest.png' with { type: 'file' };
import MOTION_JSON from './raise/motion.json' with { type: 'json' };
import RAISE_JSON from './raise/record.json' with { type: 'json' };
import { PUPPETS } from './puppets.ts';
import { SKELETONS } from './skeleton.ts';

type Pt = readonly [number, number];

const Point = Schema.Tuple([Schema.Finite, Schema.Finite]);

/** The record's keys (each its id, its place, key px to sheet px, its pivot and hand, sheet px) and its held drawings (each its id and centre, held px). */
const RaiseRecord = Schema.Struct({
  keys: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      place: Schema.Struct({ s: Schema.Finite, dx: Schema.Finite, dy: Schema.Finite }),
      pivot: Point,
      hand: Point,
    }),
  ),
  held: Schema.NonEmptyArray(Schema.Struct({ id: Schema.String, c: Point })),
});

/** Clip B's motion: its keys in order and, for each frame, the key shown and its turn about the key's pivot, deg. */
const RaiseMotion = Schema.Struct({
  count: Schema.Int,
  keys: Schema.NonEmptyArray(Schema.Struct({ id: Schema.String })),
  frames: Schema.NonEmptyArray(Schema.Struct({ key: Schema.String, theta: Schema.Finite })),
});

/** The record and the motion, read once here. */
const RECORD = Schema.decodeUnknownSync(RaiseRecord)(RAISE_JSON);
const MOTION = Schema.decodeUnknownSync(RaiseMotion)(MOTION_JSON);

type Key = (typeof RECORD.keys)[number];

/** Each key's drawing, by its id. */
const PNGS = { rest, k2, k3, k4, k5, k6 };

/** Key `id`'s drawing, if it has one. */
const pngOf = (id: string) =>
  Option.map(
    Arr.findFirst(Rec.toEntries(PNGS), ([k]) => k === id),
    ([, png]) => png,
  );

/** How far round the held hand the line is left as the drawings draw it, sheet px: 0, since each key keeps its own lower line up to the cuff and the L3 line closes on the held ring. */
const QUIET = 0;

const COUNT = MOTION.count;

const [HELD] = RECORD.held;

/** Fails at load, naming what is missing. */
const missing = (what: string): never => Schema.decodeUnknownSync(Schema.Never)(what);

/** The motion's keys in order, each with its record key and its drawing (a key the record or the drawings lack fails here, at load). */
const KEYS = Arr.map(MOTION.keys, ({ id }) =>
  Option.match(
    Option.all({ key: Arr.findFirst(RECORD.keys, (k) => k.id === id), png: pngOf(id) }),
    {
      onNone: () => missing(id),
      onSome: ({ key, png }) => ({ id, png, key }),
    },
  ),
);

/** Each frame's key and turn (a frame naming a key the motion lacks fails here, at load). */
const FRAMES = Arr.map(MOTION.frames, ({ key, theta }) =>
  Option.match(
    Arr.findFirst(KEYS, (x) => x.id === key),
    { onNone: () => missing(key), onSome: (k) => ({ ...k, theta }) },
  ),
);

/** A sheet point turned `theta` deg about `pivot`. */
const turned = ([x, y]: Pt, [px, py]: Pt, theta: number): Pt => {
  const a = (theta * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return [px + c * (x - px) - s * (y - py), py + s * (x - px) + c * (y - py)];
};

/** Where a key's held hand stands at a turn, sheet px: its hand turned with it, moved to whole px from the drawing's centre so the drawing's px lie on the frame's. */
const heldAt = (k: Key, theta: number): Pt => {
  const hand = turned(k.hand, k.pivot, theta);
  return [HELD.c[0] + Math.round(hand[0] - HELD.c[0]), HELD.c[1] + Math.round(hand[1] - HELD.c[1])];
};

/** Frame `i`'s look: its key laid in place of his sleeve and turned (unturned at rest, the sleeve is his own), the held hand at its key's, the boil on twos. */
const lookOf = (i: number): PuppetLook => {
  const { id, key, theta } = frameAt(i);
  const held = { drawing: HELD.id, c: HELD.c, at: heldAt(key, theta), quiet: QUIET };
  const boil = Math.floor(i / 2);
  const swap = { part: 'armRight', drawing: id, place: key.place, pivot: key.pivot, theta };
  return { boil, held, ...((id !== 'rest' || theta !== 0) && { swap }) };
};

/** The front puppet with the raise's drawings. */
const PUPPET = {
  ...PUPPETS.front,
  drawings: [...KEYS.map((k) => ({ name: k.id, png: k.png })), { name: HELD.id, png: heldPoses1 }],
};

/** Frame `i` held to the raise's frames. */
const clamped = (i: number) => Math.min(COUNT - 1, FRAMES.length - 1, Math.max(0, i));

/** Frame `i`'s key and turn, `i` held to the raise's frames. */
const frameAt = (i: number) => Arr.getUnsafe(FRAMES, clamped(i));

/** The raise, rest to poses-1: 2 s at 24 fps. */
export const RAISE: CutoutEase = {
  kind: 'turnaround',
  view: 'front',
  from: 'rest',
  to: 'poses-1',
  fps: 24,
  count: COUNT,
  puppet: PUPPET,
  frame: (i): CutoutEaseFrame => ({
    pose: { numbers: {}, root: SKELETONS.front.root, scale: 1 },
    look: lookOf(i),
    key: frameAt(i).id,
    theta: frameAt(i).theta,
    held: HELD.id,
  }),
};
