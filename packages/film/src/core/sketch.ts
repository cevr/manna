import { Schema } from 'effect';

const SketchInk = Schema.Literals(['ink', 'red', 'gold']);
type SketchInk = typeof SketchInk.Type;

const SketchPoint = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  p: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
});
type SketchPoint = typeof SketchPoint.Type;

const Common = { id: Schema.String, ink: SketchInk };

const Box = {
  x: Schema.Finite,
  y: Schema.Finite,
  w: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  h: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
};

export const SketchItem = Schema.Union([
  Schema.TaggedStruct('Pen', { ...Common, points: Schema.NonEmptyArray(SketchPoint) }),
  Schema.TaggedStruct('Arrow', { ...Common, from: SketchPoint, to: SketchPoint }),
  Schema.TaggedStruct('Rect', { ...Common, ...Box }),
  Schema.TaggedStruct('Ellipse', { ...Common, ...Box }),
  Schema.TaggedStruct('Text', {
    ...Common,
    at: SketchPoint,
    text: Schema.String.check(Schema.isNonEmpty()),
  }),
]).pipe(Schema.toTaggedUnion('_tag'));
export type SketchItem = typeof SketchItem.Type;

export const sketchSummary = (items: ReadonlyArray<SketchItem>): string => {
  const counts = new Map<string, number>();
  for (const s of items) counts.set(s._tag, (counts.get(s._tag) ?? 0) + 1);
  return [...counts].map(([tag, n]) => `${tag.toLowerCase()} ${n}`).join(', ');
};
