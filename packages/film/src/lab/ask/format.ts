// What the ask page says of a failure and of a video's file, and which copy
// of a video it plays: pure, so each reads the same in a test as on the page.

import { Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type { ReviewVideo } from '../../core/review.ts';
import { reviewFileUrl, reviewPhoneUrl } from '../../core/api.ts';
import type { LabFailure } from '../api.ts';

/** What a failure says: its words, without its tag. */
export const failureText = (failure: LabFailure): string => failure.message.replace(/^\w+: /, '');

/** What a failed read or write says (`failureText`). */
export const failedText = (result: AsyncResult.AsyncResult<unknown, LabFailure>): string =>
  Option.getOrElse(Option.map(AsyncResult.error(result), failureText), () => '');

/** A size in bytes as a card says it: `812 KB`, `2.4 GB`. */
export const sizeText = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  for (const unit of units) {
    // A tenth only where it tells: 2.4 GB, 36 MB.
    if (n < 10 && unit !== 'B') return `${n.toFixed(1)} ${unit}`;
    if (n < 1024) return `${n.toFixed(0)} ${unit}`;
    n /= 1024;
  }
  return `${n.toFixed(1)} TB`;
};

/** How wide a video's poster still is: the frame a card shows before it plays. */
export const POSTER_W = 960;

/**
 * Which copy a video plays: the Proxy (`phone`, its 720p copy, made for big
 * videos) or the Original (`full`, the file itself). The stored words stay.
 */
export type Quality = 'phone' | 'full';

/**
 * The URL a video plays from at `quality`: on Proxy its proxy once made, or
 * the file when it is small enough to need none; none while its proxy is
 * still being made, so a phone never streams the original in its place.
 * On Original, the file.
 */
export const videoSource = (video: ReviewVideo, quality: Quality): Option.Option<string> => {
  if (quality === 'full' || video.phone === 'none') return Option.some(reviewFileUrl(video.ref));
  if (video.phone === 'ready') return Option.some(reviewPhoneUrl(video.ref));
  return Option.none();
};
