import { Schema } from 'effect';

import { SimError } from './errors.ts';

export const Platform = Schema.Literals(['ios', 'web']);
export type Platform = typeof Platform.Type;

export const Session = Schema.Struct({
  platform: Platform,
  out: Schema.String,
  port: Schema.Finite,
  serverPid: Schema.Finite,
  udid: Schema.String,
  bootedAt: Schema.String,
});
export interface Session extends Schema.Schema.Type<typeof Session> {}

export const Success = Schema.Struct({
  ok: Schema.Literal(true),
  command: Schema.String,
  platform: Platform,
  paths: Schema.Record(Schema.String, Schema.String),
  detail: Schema.Record(
    Schema.String,
    Schema.Union([Schema.String, Schema.Finite, Schema.Boolean]),
  ),
  ms: Schema.Finite,
});
export interface Success extends Schema.Schema.Type<typeof Success> {}

export const Failure = Schema.Struct({
  ok: Schema.Literal(false),
  command: Schema.String,
  message: Schema.String,
  error: SimError,
  ms: Schema.Finite,
});
export interface Failure extends Schema.Schema.Type<typeof Failure> {}

export const encodeFailure = Schema.encodeSync(Schema.fromJsonString(Failure));

export const Result = Schema.Union([Success, Failure]);
export type Result = typeof Result.Type;
