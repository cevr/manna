// The lead's raise: his front cut-out from rest to poses-1 (the bottle raised)
// in 48 frames at 24 fps, a big move drawn from keys (`raise/record.json`):
// his own sleeve at rest, four in-betweens drawn by okra (world-proto r5c's,
// their hands cleared), and poses-1's own arm raised, each laid in place of
// his `armRight` and held four frames on twos; the kept hand and bottle of
// poses-1 laid over at each key's hand; the boil on twos. A frame is a
// function of its index alone.

import type { CutoutEase, CutoutEaseFrame, PuppetLook } from '@manna/film/canvas';
import { Array as Arr, Option, Schema } from 'effect';
import heldPoses1 from './raise/held/poses-1.png' with { type: 'file' };
import early from './raise/keys/early.png' with { type: 'file' };
import half from './raise/keys/half.png' with { type: 'file' };
import quarter from './raise/keys/quarter.png' with { type: 'file' };
import raised from './raise/keys/raised.png' with { type: 'file' };
import rest from './raise/keys/rest.png' with { type: 'file' };
import threeQuarter from './raise/keys/three-quarter.png' with { type: 'file' };
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

/** The record, read once here. */
const RECORD = Schema.decodeUnknownSync(RaiseRecord)(RAISE_JSON);

type Key = (typeof RECORD.keys)[number];

/** The keys in their order, each with its PNG and the frame it is first shown on: rest f0-19, each in-between 4 frames, raised from f36 (world-proto r5c's exposures; the owner: "arm motion looks good"). */
const EXPOSED = [
  { id: 'rest', png: rest, from: 0 },
  { id: 'early', png: early, from: 20 },
  { id: 'quarter', png: quarter, from: 24 },
  { id: 'half', png: half, from: 28 },
  { id: 'three-quarter', png: threeQuarter, from: 32 },
  { id: 'raised', png: raised, from: 36 },
] as const;

/** How far round the held hand the line is left as the drawings draw it, sheet px: 0, since each key keeps its own lower line up to the cuff and the L3 line closes on the held ring. */
const QUIET = 0;

const COUNT = 48;

const [HELD] = RECORD.held;

/** Each exposure with its key from the record (a key the record lacks fails here, at load). */
const KEYS = Arr.map(EXPOSED, (e) => {
  const key = Arr.findFirst(RECORD.keys, (k) => k.id === e.id);
  if (key._tag === 'None') return Schema.decodeUnknownSync(Schema.Never)(e.id);
  return { ...e, key: key.value };
});

/** The exposure frame `i` shows: the last one begun by its pair's first frame (on twos). */
const exposureOf = (i: number) => {
  const on = i - (i % 2);
  // f0 shows rest, so some exposure has begun by every frame
  return Option.getOrElse(
    Arr.findLast(KEYS, (k) => k.from <= on),
    () => Arr.headNonEmpty(KEYS),
  );
};

/** Where a key's held hand stands, sheet px: its hand, moved to whole px from the drawing's centre so the drawing's px lie on the frame's. */
const heldAt = (k: Key): Pt => [
  HELD.c[0] + Math.round(k.hand[0] - HELD.c[0]),
  HELD.c[1] + Math.round(k.hand[1] - HELD.c[1]),
];

/** Frame `i`'s look: its key laid in place of his sleeve (at rest the sleeve is the rest key), the held hand at its key's, the boil on twos. */
const lookOf = (i: number): PuppetLook => {
  const { id, key } = exposureOf(i);
  const held = { drawing: HELD.id, c: HELD.c, at: heldAt(key), quiet: QUIET };
  const boil = Math.floor(i / 2);
  const swap = { part: 'armRight', drawing: id, place: key.place, pivot: key.pivot, theta: 0 };
  return { boil, held, ...(id !== 'rest' && { swap }) };
};

/** The front puppet with the raise's drawings. */
const PUPPET = {
  ...PUPPETS.front,
  drawings: [...KEYS.map((k) => ({ name: k.id, png: k.png })), { name: HELD.id, png: heldPoses1 }],
};

/** Frame `i` held to the raise's frames. */
const clamped = (i: number) => Math.min(COUNT - 1, Math.max(0, i));

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
    look: lookOf(clamped(i)),
    key: exposureOf(clamped(i)).id,
    theta: 0,
    held: HELD.id,
  }),
};
