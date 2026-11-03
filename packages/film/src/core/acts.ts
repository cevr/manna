import { Array as Arr, Option, Result } from 'effect';
import { PartOutOfOrder, UnknownScene } from './errors.ts';
import type { Placed } from './layout.ts';
import type { Interval } from './time.ts';

interface PartOf {
  readonly from: string;
  readonly name: string;
}

interface Members<P> {
  readonly part: P;
  readonly scenes: ReadonlyArray<string>;
}

export interface Stretch<P> extends Members<P>, Interval {}

export type PartError = UnknownScene | PartOutOfOrder;

const indicesOf = <P extends PartOf>(
  parts: ReadonlyArray<P>,
  ids: ReadonlyArray<string>,
): Result.Result<ReadonlyArray<number>, PartError> => {
  const at: Array<number> = [];
  for (const [i, part] of parts.entries()) {
    const index = ids.indexOf(part.from);
    if (index < 0) return Result.fail(UnknownScene.make({ scene: part.from, known: ids }));
    const ahead = Option.all([Arr.get(parts, i - 1), Arr.get(at, i - 1)]);
    if (Option.isSome(ahead) && index <= ahead.value[1])
      return Result.fail(
        PartOutOfOrder.make({ part: part.name, from: part.from, after: ahead.value[0].name }),
      );
    at.push(index);
  }
  return Result.succeed(at);
};

export const membersOf = <P extends PartOf>(
  parts: ReadonlyArray<P>,
  ids: ReadonlyArray<string>,
): Result.Result<ReadonlyArray<Members<P>>, PartError> =>
  Result.map(indicesOf(parts, ids), (at) => {
    const bounds = [0, ...at.slice(1), ids.length];
    return parts.map((part, i) => ({
      part,
      scenes: ids.slice(Arr.getUnsafe(bounds, i), Arr.getUnsafe(bounds, i + 1)),
    }));
  });

export const stretchesOf = <P extends PartOf>(
  parts: ReadonlyArray<P>,
  placed: ReadonlyArray<Placed>,
): Result.Result<ReadonlyArray<Stretch<P>>, PartError> => {
  const byId = new Map(placed.map((p) => [p.spec.id, p]));
  const scene = (id: Option.Option<string>) =>
    Option.flatMap(id, (s) => Option.fromUndefinedOr(byId.get(s)));
  return Result.map(
    membersOf(
      parts,
      placed.map((p) => p.spec.id),
    ),
    (members) =>
      members.map(({ part, scenes }) => ({
        part,
        scenes,
        from: Option.match(scene(Arr.head(scenes)), { onNone: () => 0, onSome: (p) => p.start }),
        to: Option.match(scene(Arr.last(scenes)), {
          onNone: () => 0,
          onSome: (p) => p.start + p.dur,
        }),
      })),
  );
};
