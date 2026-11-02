// A seated member's whole-figure frames (`<member>/cutout/seated/frames/`):
// the keys of one figure on its stool (neutral, turn, smile), each a painted
// frame (`PaintingSpec`) clear on all four sides. One box holds them all,
// each key laid so its still seat (the stool, the hem and the feet) lies on
// key 1's, so a scene swaps the keys whole in one place, with no tween
// between them, each held at least the record's `hold` film frames (on twos).
// A frame's px are the box's own. The frames leave out the drawn floor
// shadow: a scene draws the engine's contact shadow (`ground`) at `ground`.

import type { PaintingSpec } from '@manna/film/canvas';
import { Record as Records, Schema } from 'effect';

const Point = Schema.Tuple([Schema.Finite, Schema.Finite]);

/** The record: the box's size, the drawn shadow's centre (frame px) and width, and the keys in order. A member decodes its `record.json` with it where it imports the file. */
export const SeatedRecord = Schema.Struct({
  box: Schema.Struct({ size: Point }),
  anchor: Point,
  ground: Schema.Finite,
  frames: Schema.Array(Schema.Struct({ id: Schema.String })),
});

/** Fails at load, naming what is missing. */
const missing = (what: string): never => Schema.decodeUnknownSync(Schema.Never)(what);

/**
 * A seated member's frames, from its decoded record `read` with its keys' PNGs
 * by id, in the record's order (any other order or key fails at load): each
 * key as a painting keyed `<member>/seated/<id>`, the box's size, and the
 * contact shadow's centre and width, frame px.
 */
export const seatedFrames = <Id extends string>(
  member: string,
  read: typeof SeatedRecord.Type,
  pngs: Readonly<Record<Id, string>>,
) => {
  const ids = Records.keys(pngs).join(' ');
  if (read.frames.map((x) => x.id).join(' ') !== ids) missing(`${member} seated frames ${ids}`);
  return {
    /** Each key as a painting, by its id. */
    paintings: Records.map(pngs, (png, id): PaintingSpec => ({
      key: `${member}/seated/${id}`,
      png,
      size: read.box.size,
      open: ['top', 'right', 'bottom', 'left'],
    })),
    /** The box's size, frame px. */
    size: read.box.size,
    /** The contact shadow under the stool (`ground`): its centre and its width, frame px. */
    ground: { at: read.anchor, w: read.ground },
  } as const;
};
