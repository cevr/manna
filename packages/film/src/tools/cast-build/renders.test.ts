import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import type { PoseSpec } from '../../core/pose-sample.ts';
import { puppetOf } from '../../core/puppet.ts';
import { shardOf, trainsetOf } from './renders.ts';
import { filesIn, seedsIn } from './testing.ts';

const [W, H] = [24, 40];
const rgba = new Uint8Array(W * H * 4);
for (let y = 4; y < 36; y++)
  for (let x = 8; x < 16; x++) rgba.set([60, 90, 200, 255], (y * W + x) * 4);
const SPEC: PoseSpec = {
  puppet: Result.getOrThrow(
    puppetOf(
      { width: W, height: H, parts: [{ name: 'body', pixels: { width: W, height: H, rgba } }] },
      {
        bones: [
          { name: 'lean', pivot: [12, 34], tip: [12, 12] },
          { name: 'head', parent: 'lean', pivot: [12, 12], tip: [12, 4] },
        ],
        skin: { body: ['lean', 'head'] },
      },
    ),
  ),
  paper: [230, 220, 200],
  size: [32, 40],
};
const COUNTS = { train: 2, held: 1 };

/** The names of a ustar archive's files, in order. */
const namesIn = (tar: Uint8Array) => filesIn(tar).map(([name]) => name);

describe('the seeds of a shard', () => {
  test('a seed is the drawing’s own: from its member and id, never a list position', () => {
    const counts = { train: 4, held: 1 };
    const front = seedsIn(shardOf(SPEC, 'lead-feast', 'turnaround-front', counts));
    expect(seedsIn(shardOf(SPEC, 'lead-feast', 'turnaround-front', counts))).toEqual(front);
    const short = seedsIn(shardOf(SPEC, 'lead-feast', 'turnaround-front', { train: 1, held: 1 }));
    expect(Object.keys(short).toSorted()).toEqual(['held/0', 'train/0']);
    expect([short['train/0'], short['held/0']]).toEqual([front['train/0'], front['held/0']]);
    const one = { train: 1, held: 0 };
    const seeds = new Set([
      ...Object.values(front),
      ...Object.values(seedsIn(shardOf(SPEC, 'lead-feast', 'single-single-1', one))),
      ...Object.values(seedsIn(shardOf(SPEC, 'sower', 'turnaround-front', one))),
    ]);
    expect(seeds.size).toBe(7);
  });
});

describe('shardOf', () => {
  test('one drawing makes the same bytes every time, each sample a PNG and its truth', () => {
    const a = shardOf(SPEC, 'lead-feast', 'raise/k2', COUNTS);
    expect(
      Buffer.from(a).equals(Buffer.from(shardOf(SPEC, 'lead-feast', 'raise/k2', COUNTS))),
    ).toBe(true);
    expect(namesIn(a)).toEqual([
      'train/lead-feast__raise-k2__0000.png',
      'train/lead-feast__raise-k2__0000.json',
      'train/lead-feast__raise-k2__0001.png',
      'train/lead-feast__raise-k2__0001.json',
      'held/lead-feast__raise-k2__0000.png',
      'held/lead-feast__raise-k2__0000.json',
    ]);
  });

  test('another drawing id draws other samples of the same puppet', () => {
    const a = shardOf(SPEC, 'lead-feast', 'turnaround-front', COUNTS);
    const b = shardOf(SPEC, 'lead-feast', 'turnaround-back', COUNTS);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});

describe('trainsetOf', () => {
  test('the set is the same whatever order its shards arrive in', () => {
    const shards = {
      'lead-feast/turnaround-front': 'aa',
      'sower/poses-poses-1': 'bb',
      'lead-feast/heads-heads-4': 'cc',
    };
    const reversed = Object.fromEntries(Object.entries(shards).toReversed());
    expect(new TextDecoder().decode(trainsetOf(reversed))).toBe(
      new TextDecoder().decode(trainsetOf(shards)),
    );
    expect(new TextDecoder().decode(trainsetOf(shards))).toBe(
      'lead-feast/heads-heads-4=cc\nlead-feast/turnaround-front=aa\nsower/poses-poses-1=bb',
    );
  });
});
