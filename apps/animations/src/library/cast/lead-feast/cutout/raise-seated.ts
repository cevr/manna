// The lead's seated raise (`raise-seated/frames/record.json`): six whole
// figures of him on his stool, `rest` (the bottle on his lap) to `k6` (the
// kept single-9 view, the bottle raised), each a painted frame
// (`PaintingSpec`) clear on all four sides, shown in order for the record's
// `hold` film frames each (on twos), the last kept after. A frame lies on his
// single-9 view's px (the kept box's; the record's `place` lays each frame
// there), whose top-left is his single-9 cut-out's origin, so a scene draws a
// frame where its posed single-9 cut-out lays those px and the two lie on
// each other.
// The frames leave out the drawn floor shadow: a scene draws the engine's
// contact shadow (`ground`) at `ground`. Read once from the record.

import type { PaintingSpec } from '@manna/film/canvas';
import { Array as Arr, Schema } from 'effect';
import k2 from './raise-seated/frames/k2.png' with { type: 'file' };
import k3 from './raise-seated/frames/k3.png' with { type: 'file' };
import k4 from './raise-seated/frames/k4.png' with { type: 'file' };
import k5 from './raise-seated/frames/k5.png' with { type: 'file' };
import k6 from './raise-seated/frames/k6.png' with { type: 'file' };
import RECORD_JSON from './raise-seated/frames/record.json' with { type: 'json' };
import rest from './raise-seated/frames/rest.png' with { type: 'file' };

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

/** The raise's frames in the order it shows them. */
const IDS = ['rest', 'k2', 'k3', 'k4', 'k5', 'k6'] as const;

type Id = (typeof IDS)[number];

/** A frame's name as a drawing's painting. */
type Name = `raise-${Id}`;

/** Each frame's drawing, by its id. */
const PNGS: Readonly<Record<Id, string>> = { rest, k2, k3, k4, k5, k6 };

/** Fails at load, naming what is missing. */
const missing = (what: string): never => Schema.decodeUnknownSync(Schema.Never)(what);

// The record's frames are these, in this order: any other fails here, at load.
if (RECORD.frames.map((x) => x.id).join(' ') !== IDS.join(' '))
  missing(`raise-seated frames ${IDS.join(' ')}`);

/** Frame `id` as a painting: the frames' box on his view's px. */
const painting = (id: Id): PaintingSpec => ({
  key: `lead-feast/raise-seated/${id}`,
  png: PNGS[id],
  size: RECORD.box.size,
  at: RECORD.box.view,
  open: ['top', 'right', 'bottom', 'left'],
});

/** The seated raise, for a scene that poses his single-9 cut-out. */
export const RAISE_SEATED = {
  /** Each frame as a painting, by its name: spread into a drawing's `paintings`. */
  paintings: {
    'raise-rest': painting('rest'),
    'raise-k2': painting('k2'),
    'raise-k3': painting('k3'),
    'raise-k4': painting('k4'),
    'raise-k5': painting('k5'),
    'raise-k6': painting('k6'),
  } satisfies Readonly<Record<Name, PaintingSpec>>,
  /** The film frames from the raise's start to its last frame: each frame but the last held `hold`. */
  frames: (IDS.length - 1) * RECORD.hold,
  /** The frame shown `n` whole film frames into the raise: rest before it, each frame `hold` film frames, the last kept after. */
  frame: (n: number): Name =>
    `raise-${Arr.getUnsafe(IDS, Math.min(IDS.length - 1, Math.max(0, Math.floor(n / RECORD.hold))))}`,
  /** The contact shadow under him (`ground`), on his view's px: its centre and its width. */
  ground: {
    at: [RECORD.anchor[0] + RECORD.box.view[0], RECORD.anchor[1] + RECORD.box.view[1]],
    w: RECORD.ground,
  },
} as const;
