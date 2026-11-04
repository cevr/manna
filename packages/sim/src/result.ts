/**
 * What `sim.ts` prints and keeps: one JSON result per command on stdout, and
 * the drive's session, which `boot` writes and every later command reads.
 */
import { Schema } from 'effect';

import { SimError } from './errors.ts';

export const Platform = Schema.Literals(['ios', 'web']);
export type Platform = typeof Platform.Type;

/** A booted drive: what `boot` started, so later commands reach it and `down` stops it. */
export const Session = Schema.Struct({
  platform: Platform,
  /** Where the drive's logs and screenshots go. */
  out: Schema.String,
  /** The dev server's port, one of the app's ports. */
  port: Schema.Finite,
  /** The process that owns the dev server (`sim.ts serve`). */
  serverPid: Schema.Finite,
  /** The app's simulator's UDID; empty on the web. */
  udid: Schema.String,
  /** When `boot` started, ISO 8601: `log` reads the app's log from here. */
  bootedAt: Schema.String,
  /**
   * The server's start time, read when `boot` started it (`os.ts`): with
   * `serverPid`, the process the drive may stop. A session without it is
   * legacy (an older `boot`'s): it grants no signal, and its drivers keep
   * the caller's environment.
   */
  serverStarted: Schema.optionalKey(Schema.String),
  /** The drivers' HOME, `<state>/home`, which `boot` made; absent in a legacy session. */
  home: Schema.optionalKey(Schema.String),
});
export interface Session extends Schema.Schema.Type<typeof Session> {}

/** A command that did what it was asked. */
export const Success = Schema.Struct({
  ok: Schema.Literal(true),
  command: Schema.String,
  platform: Platform,
  /** The files the command wrote, by what they hold. */
  paths: Schema.Record(Schema.String, Schema.String),
  /** What the command saw, in short. */
  detail: Schema.Record(
    Schema.String,
    Schema.Union([Schema.String, Schema.Finite, Schema.Boolean]),
  ),
  ms: Schema.Finite,
});
export interface Success extends Schema.Schema.Type<typeof Success> {}

/** A command that failed: its tagged error, the cause, with every field. */
const Failure = Schema.Struct({
  ok: Schema.Literal(false),
  command: Schema.String,
  message: Schema.String,
  error: SimError,
  ms: Schema.Finite,
});

/** A failure as the one JSON line it prints. */
export const encodeFailure = Schema.encodeSync(Schema.fromJsonString(Failure));
