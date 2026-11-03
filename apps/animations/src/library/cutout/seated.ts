import type { PaintingSpec } from '@manna/film/canvas';
import { Record as Records, Schema } from 'effect';

const Point = Schema.Tuple([Schema.Finite, Schema.Finite]);

export const SeatedRecord = Schema.Struct({
  box: Schema.Struct({ size: Point }),
  anchor: Point,
  ground: Schema.Finite,
  frames: Schema.Array(Schema.Struct({ id: Schema.String })),
});

const missing = (what: string): never => Schema.decodeUnknownSync(Schema.Never)(what);

export const seatedFrames = <Id extends string>(
  member: string,
  read: typeof SeatedRecord.Type,
  pngs: Readonly<Record<Id, string>>,
) => {
  const ids = Records.keys(pngs).join(' ');
  if (read.frames.map((x) => x.id).join(' ') !== ids) missing(`${member} seated frames ${ids}`);
  return {
    paintings: Records.map(pngs, (png, id): PaintingSpec => ({
      key: `${member}/seated/${id}`,
      png,
      size: read.box.size,
      open: ['top', 'right', 'bottom', 'left'],
    })),
    size: read.box.size,
    ground: { at: read.anchor, w: read.ground },
  } as const;
};
