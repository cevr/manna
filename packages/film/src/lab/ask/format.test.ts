// What the ask page says of a video's file, and which copy of a video it plays.

import { Option } from 'effect';
import { describe, expect, test } from 'bun:test';
import type { ReviewVideo } from '../../core/review.ts';
import { sizeText, videoSource } from './format.ts';

const video = (name: string, phone: ReviewVideo['phone']): ReviewVideo => ({
  ref: `out/f/${name}`,
  name,
  size: 10,
  mtime: 0,
  phone,
});

describe('what a video says', () => {
  test('sizes', () => {
    expect(sizeText(812)).toBe('812 B');
    expect(sizeText(2.5 * 1024 ** 3)).toBe('2.5 GB');
  });

  test('plays the proxy once it is made, never the original in its place, and the original when asked for', () => {
    expect(videoSource(video('a b.mp4', 'ready'), 'phone')).toEqual(
      Option.some('/api/review/phone/out/f/a%20b.mp4'),
    );
    expect(videoSource(video('a b.mp4', 'pending'), 'phone')).toEqual(Option.none());
    expect(videoSource(video('a b.mp4', 'none'), 'phone')).toEqual(
      Option.some('/api/review/files/out/f/a%20b.mp4'),
    );
    expect(videoSource(video('a b.mp4', 'ready'), 'full')).toEqual(
      Option.some('/api/review/files/out/f/a%20b.mp4'),
    );
    expect(videoSource(video('a b.mp4', 'pending'), 'full')).toEqual(
      Option.some('/api/review/files/out/f/a%20b.mp4'),
    );
  });
});
