/**
 * The JSON lines `sim` prints, as a reader of its output expects them,
 * written here rather than taken from the driver: each line holds exactly
 * these keys, so a key added, dropped or retyped fails the decode.
 */
import { Schema } from 'effect';

const Paths = Schema.Record(Schema.String, Schema.String);

/** A tagged error as it prints: its `_tag` and its fields. */
const Tagged = Schema.StructWithRest(Schema.Struct({ _tag: Schema.String }), [
  Schema.Record(Schema.String, Schema.Unknown),
]);

const Done = Schema.Struct({
  ok: Schema.Literal(true),
  command: Schema.String,
  platform: Schema.Literals(['ios', 'web']),
  paths: Paths,
  detail: Schema.Record(
    Schema.String,
    Schema.Union([Schema.String, Schema.Finite, Schema.Boolean]),
  ),
  ms: Schema.Finite,
});

const Failed = Schema.Struct({
  ok: Schema.Literal(false),
  command: Schema.String,
  message: Schema.String,
  error: Tagged,
  ms: Schema.Finite,
});

const JourneyStep = Schema.Struct({
  ok: Schema.Boolean,
  command: Schema.Literal('journey'),
  feature: Schema.String,
  step: Schema.Finite,
  name: Schema.String,
  action: Schema.String,
  paths: Paths,
  message: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(Tagged),
  ms: Schema.Finite,
});

const JourneySummary = Schema.Struct({
  ok: Schema.Boolean,
  command: Schema.Literal('journey'),
  feature: Schema.String,
  steps: Schema.Finite,
  failedStep: Schema.optionalKey(Schema.Finite),
  failedName: Schema.optionalKey(Schema.String),
  ms: Schema.Finite,
});

const resultLine = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Union([Done, Failed])));

const journeyLine = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Union([JourneyStep, JourneySummary, Failed])),
);

/** One line a command prints: what it did, or its failure. */
export const decodeResult = (line: string) => resultLine(line, { onExcessProperty: 'error' });

/** One line `sim journey` prints: a step's, the summary, or the failure of the whole command. */
export const decodeJourneyLine = (line: string) => journeyLine(line, { onExcessProperty: 'error' });
