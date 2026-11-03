import { Option, Result } from 'effect';

/** The sweep's pose grid, dealt across files so one large view cannot make
 * one file unbounded. View metadata and opt-outs have one file owner. */
export const LIMB_POSES: ReadonlyArray<readonly [number, number]> = [
  25, 40, 55, 70, 85, 100, 115, 120,
].flatMap((elbow) =>
  [-120, -90, -60, -30, 0, 30, 60, 90, 120].map((wrist) => [elbow, wrist] as const),
);

export const posesFor = (view: number, shard: { readonly index: number; readonly count: number }) =>
  LIMB_POSES.filter((_, pose) => (view * LIMB_POSES.length + pose) % shard.count === shard.index);

/** Shard numbers are the numbered sibling files, contiguous from one. */
export const shardOf = (file: string, siblings: ReadonlyArray<string>) => {
  const names = siblings.filter((n) => /^limb-sweep-\d+\.slow\.test\.ts$/.test(n));
  const numberOf = (name: string) =>
    Number(Option.getOrElse(Option.fromUndefinedOr(name.split('-')[2]), () => '').split('.')[0]);
  const numbers = names.map(numberOf).toSorted((a, b) => a - b);
  if (numbers.length === 0 || !numbers.every((n, i) => n === i + 1))
    return Result.fail('sweep shards must cover 1..n exactly once');
  const name = Option.getOrElse(Option.fromUndefinedOr(file.split('/').at(-1)), () => '');
  if (!names.includes(name)) return Result.fail('unrecognised sweep shard: ' + name);
  return Result.succeed({ index: numberOf(name) - 1, count: names.length });
};
