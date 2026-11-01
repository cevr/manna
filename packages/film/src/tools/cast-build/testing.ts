// What the cast build's tests read out of a renders shard (`shardOf`'s
// ustar archive): each file, and each sample's seed from its truth JSON.

import { Schema } from 'effect';

/** A ustar archive's files, in order: each name and its bytes. */
export const filesIn = (tar: Uint8Array) => {
  const files: Array<readonly [string, Uint8Array]> = [];
  for (let at = 0; at + 512 <= tar.length;) {
    const head = tar.subarray(at, at + 512);
    if (head.every((b) => b === 0)) break;
    const size = Number.parseInt(new TextDecoder().decode(head.subarray(124, 135)), 8);
    files.push([
      new TextDecoder().decode(head.subarray(0, 100)).replace(/\0+$/, ''),
      tar.subarray(at + 512, at + 512 + size),
    ]);
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
};

const decodeTruth = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ split: Schema.String, id: Schema.String, seed: Schema.Finite }),
  ),
);

/** Each sample's seed in a shard, by `<split>/<i>`, read from its truth JSON. */
export const seedsIn = (tar: Uint8Array): Readonly<Record<string, number>> =>
  Object.fromEntries(
    filesIn(tar)
      .filter(([name]) => name.endsWith('.json'))
      .map(([, bytes]) => {
        const t = decodeTruth(new TextDecoder().decode(bytes));
        return [`${t.split}/${Number(t.id.slice(-4))}`, t.seed] as const;
      }),
  );
