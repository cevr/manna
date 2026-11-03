import { Console, Effect, Schema } from 'effect';

export const LaunchRecord = Schema.Struct({
  root: Schema.String,
  port: Schema.Int,
  origin: Schema.String,
  pid: Schema.Int,
  head: Schema.String,
  dist: Schema.String,
  outbox: Schema.String,
  log: Schema.String,
  startedAt: Schema.String,
});
export interface LaunchRecord extends Schema.Schema.Type<typeof LaunchRecord> {}

export const Letter = Schema.Struct({
  file: Schema.String,
  n: Schema.Int,
  to: Schema.String,
  subject: Schema.String,
  kind: Schema.Literals(['confirm', 'film', 'other']),
  link: Schema.optionalKey(Schema.String),
});
export interface Letter extends Schema.Schema.Type<typeof Letter> {}

export const OutboxReport = Schema.Struct({
  outbox: Schema.String,
  letters: Schema.Array(Letter),
});

export const Check = Schema.Struct({ check: Schema.String, detail: Schema.String });
export interface Check extends Schema.Schema.Type<typeof Check> {}

export const DoctorReport = Schema.Struct({
  ok: Schema.Literal(true),
  target: Schema.String,
  checks: Schema.Array(Check),
  timingsValid: Schema.Boolean,
});

export const Step = Schema.Struct({
  n: Schema.Int,
  step: Schema.String,
  action: Schema.String,
  url: Schema.String,
  observed: Schema.String,
  files: Schema.Array(Schema.String),
  atMs: Schema.Int,
});
export interface Step extends Schema.Schema.Type<typeof Step> {}

export const Steps = Schema.Array(Step);

export const Video = Schema.Struct({ path: Schema.String, seconds: Schema.Finite });

export const JourneyReport = Schema.Struct({
  journey: Schema.String,
  evidence: Schema.String,
  steps: Steps,
  video: Schema.optionalKey(Video),
});
export interface JourneyReport extends Schema.Schema.Type<typeof JourneyReport> {}

export const DriveReport = Schema.Struct({
  passed: Schema.Literal(true),
  origin: Schema.String,
  root: Schema.String,
  doctor: DoctorReport,
  journeys: Schema.Array(JourneyReport),
});

export const StageReport = Schema.Struct({
  stage: Schema.String,
  action: Schema.Literals(['up', 'down']),
  url: Schema.optionalKey(Schema.String),
  log: Schema.String,
});

export const StopReport = Schema.Struct({
  stopped: Schema.Int,
  port: Schema.Int,
  root: Schema.String,
});

export const printJson = <A, I>(schema: Schema.Codec<A, I>) => {
  const encode = Schema.encodeEffect(Schema.fromJsonString(schema));
  return (value: A) => Effect.flatMap(Effect.orDie(encode(value)), Console.log);
};

export class Refused extends Schema.TaggedError<Refused>()('Refused', {
  message: Schema.String,
}) {}

export class NotBuilt extends Schema.TaggedError<NotBuilt>()('NotBuilt', {
  message: Schema.String,
}) {}

export class NotReady extends Schema.TaggedError<NotReady>()('NotReady', {
  message: Schema.String,
}) {}

export class DoctorFailed extends Schema.TaggedError<DoctorFailed>()('DoctorFailed', {
  check: Schema.String,
  message: Schema.String,
}) {}

export class JourneyFailed extends Schema.TaggedError<JourneyFailed>()('JourneyFailed', {
  journey: Schema.String,
  step: Schema.String,
  message: Schema.String,
  evidence: Schema.String,
}) {}

export class CommandFailed extends Schema.TaggedError<CommandFailed>()('CommandFailed', {
  command: Schema.String,
  message: Schema.String,
}) {}
