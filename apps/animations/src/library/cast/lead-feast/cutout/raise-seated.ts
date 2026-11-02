// The lead's seated raise (`raise-seated/frames/record.json`): his bottle
// arm's keys (`DRAWINGS['single-9']`), `raise-rest` (the bottle on his lap) to
// `raise-k5` (the bottle near his mouth), each drawn on his single-9 sheet's
// canvas in place of his armRight, cut from the record's whole painted frames.
// They show in order for the record's `hold` film frames each (on twos), and
// then the raise lands on `k6`, the kept single-9 view, his own drawn arm.
// The frames leave out the drawn floor shadow: a scene draws the engine's
// contact shadow (`ground`) at `ground`, on his single-9 view's px. Read once
// from the record.

import { Array as Arr, Option, Schema } from 'effect';
import { DRAWINGS } from './puppets.ts';
import RECORD_JSON from './raise-seated/frames/record.json' with { type: 'json' };

const Point = Schema.Tuple([Schema.Finite, Schema.Finite]);

/** The record: the frames' box (its top-left on the view's px, its size), the drawn shadow's centre (frame px) and width, the film frames each key holds, and the frames in order. */
const SeatedRecord = Schema.Struct({
  box: Schema.Struct({ view: Point, size: Point }),
  anchor: Point,
  ground: Schema.Finite,
  hold: Schema.Int,
  frames: Schema.Array(Schema.Struct({ id: Schema.String })),
});

/** The record, read once here. */
const RECORD = Schema.decodeUnknownSync(SeatedRecord)(RECORD_JSON);

/** His raise's keys in the order it shows them; it lands on his drawn arm, k6, after the last. */
const KEYS = DRAWINGS['single-9'];

/** A key of his raise, by its drawing's name. */
export type RaiseKey = (typeof KEYS)[number]['name'];

/** Fails at load, naming what is missing. */
const missing = (what: string): never => Schema.decodeUnknownSync(Schema.Never)(what);

/** The record's frames by name: the keys', then k6's. */
const ORDER = [...KEYS.map((k) => k.name), 'raise-k6'].join(' ');

// The record's frames are these, in this order: any other fails here, at load.
if (RECORD.frames.map((x) => `raise-${x.id}`).join(' ') !== ORDER)
  missing(`raise-seated frames ${ORDER}`);

/** The film frames from the raise's start to its landing on k6: each key held `hold`. */
const FRAMES = KEYS.length * RECORD.hold;

/** The seated raise, for a scene that poses his single-9 cut-out. */
export const RAISE_SEATED = {
  frames: FRAMES,
  /** The key shown `n` whole film frames into the raise: rest before it, each key `hold` film frames, none (his drawn arm) from its landing on. */
  key: (n: number): Option.Option<RaiseKey> =>
    Option.map(Arr.get(KEYS, Math.max(0, Math.floor(n / RECORD.hold))), (k) => k.name),
  /** The contact shadow under him (`ground`), on his view's px: its centre and its width. */
  ground: {
    at: [RECORD.anchor[0] + RECORD.box.view[0], RECORD.anchor[1] + RECORD.box.view[1]],
    w: RECORD.ground,
  },
} as const;
