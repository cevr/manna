import { Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type { ReviewVideo } from '../../core/review.ts';
import { reviewFileUrl, reviewPhoneUrl } from '../../core/api.ts';
import type { LabFailure } from '../api.ts';

export const failureText = (failure: LabFailure): string => failure.message.replace(/^\w+: /, '');

export const failedText = (result: AsyncResult.AsyncResult<unknown, LabFailure>): string =>
  Option.getOrElse(Option.map(AsyncResult.error(result), failureText), () => '');

export const sizeText = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  for (const unit of units) {
    if (n < 10 && unit !== 'B') return `${n.toFixed(1)} ${unit}`;
    if (n < 1024) return `${n.toFixed(0)} ${unit}`;
    n /= 1024;
  }
  return `${n.toFixed(1)} TB`;
};

export const POSTER_W = 960;

export type Quality = 'phone' | 'full';

export const videoSource = (video: ReviewVideo, quality: Quality): Option.Option<string> => {
  if (quality === 'full' || video.phone === 'none') return Option.some(reviewFileUrl(video.ref));
  if (video.phone === 'ready') return Option.some(reviewPhoneUrl(video.ref));
  return Option.none();
};
