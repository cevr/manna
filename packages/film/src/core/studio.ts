// The lab's studio on the wire: what its panel reads (each beat's line as the
// reading sheet sets it, and where its take stands) and what it sends (a
// recorded take, or an earlier attempt to keep). Every body and answer is one
// of these Schemas, decoded on both sides. Pure: the page and the tools share
// them.

import { Schema } from 'effect';
import { Mark } from './delivery.ts';
import { Line, TakeStaleReason } from './narration.ts';
import { HeardAs, TakeSource, Voice } from './schema.ts';
import { SheetBeat } from './sheet.ts';

/**
 * The largest body the studio reads, in bytes: 64 MiB, a base64 recording of
 * about six minutes of 48 kHz 24-bit mono (a beat's line runs seconds). The
 * page derives the longest take it may record from it.
 */
export const STUDIO_MAX_BODY = 64 * 1024 * 1024;

/** A beat as a take is kept against it: its words, the text a take is hashed under, and who reads what. */
export const ReadBeat = Schema.Struct({
  id: Schema.String,
  /** What is said. */
  text: Schema.String,
  /** What is said and who says it: a take is kept under this text's hash. */
  script: Schema.String,
  /** Who reads what: the whole beat for a film with one voice, a line per turn for a cast. */
  lines: Schema.Array(Line),
  /** How it is said (`delivery.ts`), in reading order. */
  delivery: Schema.Array(Mark),
});
export type ReadBeat = typeof ReadBeat.Type;

/**
 * What the studio reads of a film's script and voice, as `film read voice`
 * answers it from a fresh process: the lab's own imports of `script.ts`,
 * `voice.ts` and the scenes stay as they were when it started, so a line
 * fixed while the lab is open reaches the sheet and the take only through
 * this.
 */
export const StudioReading = Schema.Struct({
  voice: Voice,
  heardAs: HeardAs,
  beats: Schema.Array(ReadBeat),
  sheet: Schema.Array(SheetBeat),
});
export type StudioReading = typeof StudioReading.Type;

/** One beat as the studio lists it. */
const StudioBeat = Schema.Struct({
  /** Its line as the sheet sets it: the file `takes import` reads it under, its parts and sources. */
  ...SheetBeat.fields,
  /** `recorded`: a person's take, current; `staging`: ElevenLabs'; `stale`: see `staleReason`. */
  state: Schema.Literals(['recorded', 'staging', 'stale']),
  staleReason: Schema.optionalKey(TakeStaleReason),
  /** Whether the take the timings name (current or stale) is a person's. */
  recorded: Schema.Boolean,
  /** The take the timings name, if any. */
  take: Schema.optionalKey(
    Schema.Struct({ file: Schema.String, duration: Schema.Finite, source: TakeSource }),
  ),
  /** How many recordings of this beat are kept to hear or keep instead. */
  attempts: Schema.Int,
});
type StudioBeat = typeof StudioBeat.Type;

/** One recording of a beat, as the studio lists it to hear or keep. */
export const StudioAttempt = Schema.Struct({
  file: Schema.String,
  /** What speech-to-text heard the attempt say. */
  transcript: Schema.String,
  wer: Schema.Finite,
  /** When it was recorded, epoch milliseconds. */
  at: Schema.Finite,
  duration: Schema.Finite,
  /** The take the timings name. */
  kept: Schema.Boolean,
  /** Recorded for the line as it reads now (an attempt at an earlier line cannot be kept). */
  current: Schema.Boolean,
});
export type StudioAttempt = typeof StudioAttempt.Type;

/** The take a beat's timings name when it is none of its attempts: a staging take, in the film's `narration/`. */
const StagedTake = Schema.Struct({
  file: Schema.String,
  duration: Schema.Finite,
});

/**
 * `GET /api/films/<film>/studio/takes/:beat/attempts`: newest first, and
 * the take the timings name when it is none of them (`staged`).
 */
export const StudioAttempts = Schema.Struct({
  beat: Schema.String,
  attempts: Schema.Array(StudioAttempt),
  staged: Schema.optionalKey(StagedTake),
});
export type StudioAttempts = typeof StudioAttempts.Type;
