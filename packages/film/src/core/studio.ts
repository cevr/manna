import { Schema } from 'effect';
import { Mark } from './delivery.ts';
import { Line, TakeStaleReason } from './narration.ts';
import { HeardAs, TakeSource, Voice } from './schema.ts';
import { SheetBeat } from './sheet.ts';

export const STUDIO_MAX_BODY = 64 * 1024 * 1024;

export const ReadBeat = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  script: Schema.String,
  lines: Schema.Array(Line),
  delivery: Schema.Array(Mark),
});
export type ReadBeat = typeof ReadBeat.Type;

export const StudioReading = Schema.Struct({
  voice: Voice,
  heardAs: HeardAs,
  beats: Schema.Array(ReadBeat),
  sheet: Schema.Array(SheetBeat),
});
export type StudioReading = typeof StudioReading.Type;

const StudioBeat = Schema.Struct({
  ...SheetBeat.fields,
  state: Schema.Literals(['recorded', 'staging', 'stale']),
  staleReason: Schema.optionalKey(TakeStaleReason),
  recorded: Schema.Boolean,
  take: Schema.optionalKey(
    Schema.Struct({ file: Schema.String, duration: Schema.Finite, source: TakeSource }),
  ),
  attempts: Schema.Int,
});
type StudioBeat = typeof StudioBeat.Type;

export const StudioAttempt = Schema.Struct({
  file: Schema.String,
  transcript: Schema.String,
  wer: Schema.Finite,
  at: Schema.Finite,
  duration: Schema.Finite,
  kept: Schema.Boolean,
  current: Schema.Boolean,
});
export type StudioAttempt = typeof StudioAttempt.Type;

const StagedTake = Schema.Struct({
  file: Schema.String,
  duration: Schema.Finite,
});

export const StudioAttempts = Schema.Struct({
  beat: Schema.String,
  attempts: Schema.Array(StudioAttempt),
  staged: Schema.optionalKey(StagedTake),
});
export type StudioAttempts = typeof StudioAttempts.Type;
