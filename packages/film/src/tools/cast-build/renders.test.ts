import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import type { PoseSpec } from '../../core/pose-sample.ts';
import { puppetOf } from '../../core/puppet.ts';
import { seedOf, shardOf, trainsetOf } from './renders.ts';

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
const namesIn = (tar: Uint8Array) => {
  const names: Array<string> = [];
  for (let at = 0; at + 512 <= tar.length;) {
    const head = tar.subarray(at, at + 512);
    if (head.every((b) => b === 0)) break;
    names.push(new TextDecoder().decode(head.subarray(0, 100)).replace(/\0+$/, ''));
    const size = Number.parseInt(new TextDecoder().decode(head.subarray(124, 135)), 8);
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return names;
};

describe('seedOf', () => {
  test('a seed is the drawing’s own: from its member and id, never a list position', () => {
    expect(seedOf('lead-feast', 'turnaround-front', 'train', 3)).toBe(
      seedOf('lead-feast', 'turnaround-front', 'train', 3),
    );
    const seeds = new Set([
      seedOf('lead-feast', 'turnaround-front', 'train', 0),
      seedOf('lead-feast', 'turnaround-front', 'held', 0),
      seedOf('lead-feast', 'single-single-1', 'train', 0),
      seedOf('sower', 'turnaround-front', 'train', 0),
    ]);
    expect(seeds.size).toBe(4);
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
