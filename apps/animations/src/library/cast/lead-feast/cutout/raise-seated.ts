import { Array as Arr, Option, Schema } from 'effect';
import { DRAWINGS } from './puppets.ts';
import RECORD_JSON from './raise-seated/frames/record.json' with { type: 'json' };

const Point = Schema.Tuple([Schema.Finite, Schema.Finite]);

const SeatedRecord = Schema.Struct({
  box: Schema.Struct({ view: Point, size: Point }),
  anchor: Point,
  ground: Schema.Finite,
  hold: Schema.Int,
  frames: Schema.Array(Schema.Struct({ id: Schema.String })),
});

const RECORD = Schema.decodeUnknownSync(SeatedRecord)(RECORD_JSON);

const KEYS = DRAWINGS['single-9'];

export type RaiseKey = (typeof KEYS)[number]['name'];

const missing = (what: string): never => Schema.decodeUnknownSync(Schema.Never)(what);

const ORDER = [...KEYS.map((k) => k.name), 'raise-k6'].join(' ');

if (RECORD.frames.map((x) => `raise-${x.id}`).join(' ') !== ORDER)
  missing(`raise-seated frames ${ORDER}`);

const FRAMES = KEYS.length * RECORD.hold;

export const RAISE_SEATED = {
  frames: FRAMES,
  key: (n: number): Option.Option<RaiseKey> =>
    Option.map(Arr.get(KEYS, Math.max(0, Math.floor(n / RECORD.hold))), (k) => k.name),
  ground: {
    at: [RECORD.anchor[0] + RECORD.box.view[0], RECORD.anchor[1] + RECORD.box.view[1]],
    w: RECORD.ground,
  },
} as const;
