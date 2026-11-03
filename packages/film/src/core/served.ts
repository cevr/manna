import { Schema } from 'effect';

export const ReviewFile = Schema.Struct({
  ref: Schema.String,
  name: Schema.String,
  size: Schema.Finite,
  mtime: Schema.Finite,
});
export type ReviewFile = typeof ReviewFile.Type;

export const ReviewVideo = Schema.Struct({
  ...ReviewFile.fields,
  phone: Schema.Literals(['none', 'pending', 'ready', 'failed']),
});
export type ReviewVideo = typeof ReviewVideo.Type;

export type PhoneCopy = Exclude<ReviewVideo['phone'], 'none'>;
