/* oxlint-disable effect/noAsyncFunction -- the web module answers a Promise as the page's host awaits it. */

/**
 * A frame crosses from the app's module as base64 of its little-endian
 * Float32 samples, as Apple's `Data.base64EncodedString()` writes it: the
 * data module reads back the very samples, at every length's padding. And
 * the web's module hears only under the agent, counting a fed tone's frames
 * on the agent's clock.
 */

import { describe, expect, test } from 'bun:test';

import { FEED_RATE, FRAME } from '@manna/hymnal-app/tuner/session';

import { connect, later } from '../../modules/web/index.js';
import { seeded } from '../test/random.ts';
import { base64Of, samplesOf } from './frames.ts';

describe('a frame’s crossing', () => {
  test('samples read back as written, in the base64 the platform writes', () => {
    const random = seeded(3);
    for (const length of [0, 1, 2, 3, 7, FRAME]) {
      const samples = Float32Array.from({ length }, () => random() * 2 - 1);
      const text = base64Of(samples);
      expect(text).toBe(Buffer.from(samples.buffer).toString('base64'));
      expect([...samplesOf(text)]).toEqual([...samples]);
    }
  });
});

describe('the web’s ear', () => {
  test('off the agent there is none, and listening is refused', async () => {
    connect({ changed: () => {}, agent: false, now: () => 0 });
    expect(await later({ op: 'tuner.ear' })).toEqual({ ear: false });
    await expect(
      later({ op: 'tuner.listen', feedRate: FEED_RATE, frame: FRAME }),
    ).rejects.toThrow();
  });

  test('under the agent it counts the frames fed on the agent’s clock, until stopped', async () => {
    let clock = 1000;
    connect({ changed: () => {}, agent: true, now: () => clock });
    expect(await later({ op: 'tuner.ear' })).toEqual({ ear: true });
    expect(await later({ op: 'tuner.listen', feedRate: FEED_RATE, frame: FRAME })).toEqual({
      rate: FEED_RATE,
      ends: 0,
    });
    clock += 1000;
    expect((await later({ op: 'tuner.take' }))['fed']).toBe(Math.floor(FEED_RATE / FRAME));
    await later({ op: 'tuner.stop' });
    expect((await later({ op: 'tuner.take' }))['fed']).toBe(0);
    await expect(later({ op: 'tuner.nothing' })).rejects.toThrow();
  });
});
