/**
 * `sim journey <feature>`: a feature's journey file
 * (`features/<feature>.journey.json`), its steps and the expects each must
 * meet, run in one call over the `Drive` service. Each step prints one JSON
 * line (also appended to `<out>/results.jsonl`) and takes its receipts; the
 * first step that fails stops the journey, and the summary names it.
 */
import { Clock, Console, Effect, FileSystem, Option, Path, Result, Schema } from 'effect';
import type { PlatformError } from 'effect/PlatformError';

import {
  DIRECTIONS,
  Drive,
  type DriveMembers,
  type Outcome,
  type Place,
  type Point,
} from './drive.ts';
import {
  BadJourney,
  HostFailed,
  NotOnPlatform,
  SimError,
  type TargetMissing,
  TargetShown,
} from './errors.ts';
import { encodeFailure, type Session } from './result.ts';

/** How long a pan takes, in milliseconds, when no `ms` is given. */
export const PAN_MS = 900;
/** How long a hold presses, in milliseconds, when no `ms` is given. */
export const HOLD_MS = 900;
/** Seconds a hold waits after its press for what it opens, when no `settle` is given. */
export const HOLD_SETTLE = 10;
/** Seconds an open waits for its target, and every other step for its own. */
const OPEN_SECONDS = 30;
const STEP_SECONDS = 10;
/** Seconds a `hides` expect looks for its target: one it does not find is gone. */
const HIDES_SECONDS = 2;

/** Text of digits, dots, commas and minus signs is meant as a point. */
const POINTLIKE = /^[\d.,-]+$/;
const POINT = /^(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/;

/** Where a pan starts: `x,y` in points, or any other text as a target; a malformed point is none. */
export const panStart = (text: string): Option.Option<Point | string> => {
  if (text === '') return Option.none();
  if (!POINTLIKE.test(text)) return Option.some(text);
  return Option.map(Option.fromNullishOr(POINT.exec(text)), (point) => ({
    x: Number(point[1]),
    y: Number(point[2]),
  }));
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const Slug = Schema.String.check(Schema.isPattern(SLUG));
const Target = Schema.NonEmptyString;
const Positive = Schema.Int.check(Schema.isGreaterThan(0));
const From = Schema.String.check(
  Schema.makeFilter((text: string) =>
    Option.match(panStart(text), {
      onNone: () => `'${text}' is no x,y point and no target`,
      onSome: () => true,
    }),
  ),
);

/** What a step expects once its action is done: a target that shows, or one that is gone. */
const Expect = Schema.Union([Schema.Struct({ shows: Target }), Schema.Struct({ hides: Target })]);

/** The files a step keeps once its expects are checked. */
const Receipt = Schema.Literals(['both', 'snapshot', 'shot', 'none']);

const common = {
  /** A slug; where the step proves a sub-feature, its id. */
  name: Slug,
  expect: Schema.Array(Expect).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
  receipt: Receipt.pipe(Schema.withDecodingDefaultKey(Effect.succeed('both' as const))),
  /** Seconds the step waits for its targets. */
  timeout: Schema.optionalKey(Positive),
};

const Step = Schema.Union([
  Schema.Struct({ ...common, action: Schema.Literal('open'), link: Target }),
  Schema.Struct({ ...common, action: Schema.Literal('tap'), target: Target }),
  Schema.Struct({
    ...common,
    action: Schema.Literal('fill'),
    target: Target,
    value: Schema.String,
  }),
  Schema.Struct({ ...common, action: Schema.Literal('back') }),
  Schema.Struct({
    ...common,
    action: Schema.Literal('scroll'),
    target: Target,
    direction: Schema.Literals(DIRECTIONS),
  }),
  Schema.Struct({
    ...common,
    action: Schema.Literal('gesture'),
    from: From,
    dx: Schema.Int,
    dy: Schema.Int,
    ms: Schema.optionalKey(Positive),
  }),
  Schema.Struct({
    ...common,
    action: Schema.Literal('hold'),
    target: Target,
    ms: Schema.optionalKey(Positive),
    settle: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  }),
  Schema.Struct({ ...common, action: Schema.Literal('relaunch') }),
]);
type Step = typeof Step.Type;

const namesOnce = (steps: ReadonlyArray<Step>) => {
  const repeated = steps.filter((step, index) =>
    steps.slice(0, index).some((before) => before.name === step.name),
  );
  if (repeated.length === 0) return true;
  return `step names repeat: ${repeated.map((step) => step.name).join(', ')}`;
};

/** A feature's journey: iOS only, one step or more, each step named once. */
export const Journey = Schema.Struct({
  feature: Slug,
  platform: Schema.Literal('ios'),
  steps: Schema.Array(Step).check(Schema.isMinLength(1), Schema.makeFilter(namesOnce)),
});
export type Journey = typeof Journey.Type;

const decodeText = Schema.decodeUnknownEffect(Schema.fromJsonString(Journey));

/** Decode a journey file's text; any key the schema does not name is refused. */
export const decodeJourney = (file: string, text: string) =>
  decodeText(text, { onExcessProperty: 'error' }).pipe(
    Effect.mapError((error) => BadJourney.make({ file, issue: error.message })),
  );

/** A failure of the host itself, reported as one. */
const hostFailed = <A, R>(
  step: Effect.Effect<A, SimError | PlatformError, R>,
): Effect.Effect<A, SimError, R> =>
  step.pipe(
    Effect.catchTag('PlatformError', (error) =>
      Effect.fail(HostFailed.make({ reason: error.message })),
    ),
  );

/**
 * Open `link`. On iOS a first open whose target does not show is tried once
 * more after the app is terminated, which clears a launch that hung on the
 * splash; the result says whether it was retried.
 */
export const openOnce = (
  place: Place,
  link: string,
  expect: Option.Option<string>,
  seconds: number,
) =>
  Effect.gen(function* () {
    const d = yield* Drive;
    return yield* d.open(place, link, expect, seconds).pipe(
      Effect.map((done): Outcome => ({ ...done, detail: { ...done.detail, retried: false } })),
      Effect.catchTag('TargetMissing', (missing: TargetMissing) => {
        if (missing.platform !== 'ios') return Effect.fail(missing);
        return d
          .open(place, link, expect, seconds, { terminate: true })
          .pipe(
            Effect.map((done): Outcome => ({ ...done, detail: { ...done.detail, retried: true } })),
          );
      }),
    );
  });

/** A journey ready to run: its file decoded, for the booted iOS drive. */
export const loadJourney = Effect.fn('Sim.loadJourney')(function* (place: Place, feature: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(place.features, `${feature}.journey.json`);
  if (!SLUG.test(feature)) {
    return yield* BadJourney.make({ file, issue: `${feature} is no feature name (a-z, 0-9, -)` });
  }
  const text = yield* fs
    .readFileString(file)
    .pipe(Effect.mapError((error) => BadJourney.make({ file, issue: error.message })));
  const journey = yield* decodeJourney(file, text);
  if (journey.feature !== feature) {
    return yield* BadJourney.make({
      file,
      issue: `its feature is ${journey.feature}, not ${feature}`,
    });
  }
  const session = yield* (yield* Drive).readSession(place);
  if (session.platform !== 'ios') {
    return yield* NotOnPlatform.make({ command: 'journey', platform: session.platform });
  }
  return { journey, session };
});

type Expectation = Step['expect'][number];

/** The target an expect waits to show, if it is a `shows`. */
const showsOf = (expect: Expectation): Option.Option<string> => {
  if ('shows' in expect) return Option.some(expect.shows);
  return Option.none();
};

/** Run a step's action; how many of its expects the action checked itself (an open, its first `shows`). */
const act = (d: DriveMembers, place: Place, step: Step) => {
  const seconds = step.timeout ?? STEP_SECONDS;
  switch (step.action) {
    case 'open': {
      const shows = Option.flatMap(Option.fromNullishOr(step.expect[0]), showsOf);
      return openOnce(place, step.link, shows, step.timeout ?? OPEN_SECONDS).pipe(
        Effect.as(Option.match(shows, { onNone: () => 0, onSome: () => 1 })),
      );
    }
    case 'tap':
      return Effect.as(d.tap(place, step.target, seconds), 0);
    case 'fill':
      return Effect.as(d.fill(place, step.target, step.value, seconds), 0);
    case 'back':
      return Effect.as(d.back(place), 0);
    case 'scroll':
      return Effect.as(d.scroll(place, step.target, step.direction, seconds), 0);
    case 'gesture': {
      // The decoder refused every `from` that is neither a point nor a target.
      const from = Option.getOrElse(panStart(step.from), () => step.from);
      return Effect.as(
        d.gesture(place, { from, dx: step.dx, dy: step.dy, ms: step.ms ?? PAN_MS }),
        0,
      );
    }
    case 'hold':
      return Effect.as(
        d.hold(place, step.target, step.ms ?? HOLD_MS, step.settle ?? HOLD_SETTLE),
        0,
      );
    case 'relaunch':
      return Effect.as(d.relaunch(place), 0);
  }
};

/** Check one expect: a `shows` target waits the step's time; a `hides` target must not show within 2 s. */
const meet = (d: DriveMembers, place: Place, expect: Expectation, seconds: number) => {
  if ('shows' in expect) return d.sees(place, expect.shows, seconds);
  return d.sees(place, expect.hides, HIDES_SECONDS).pipe(
    Effect.andThen(Effect.fail(TargetShown.make({ target: expect.hides }))),
    Effect.catchTag('TargetMissing', () => Effect.void),
  );
};

/** Take a step's receipts, named `<feature>-<nn>-<step>`: the files they wrote. */
const receipts = (d: DriveMembers, place: Place, name: string, receipt: Step['receipt']) =>
  Effect.gen(function* () {
    let paths: Outcome['paths'] = {};
    if (receipt === 'both' || receipt === 'snapshot') {
      paths = { ...paths, ...(yield* d.snapshot(place, Option.some(name))).paths };
    }
    if (receipt === 'both' || receipt === 'shot') {
      paths = { ...paths, ...(yield* d.shot(place, Option.some(name))).paths };
    }
    return paths;
  });

/** One step's line: what it did, its receipts, and on failure its tagged error. */
const StepLine = Schema.Struct({
  ok: Schema.Boolean,
  command: Schema.Literal('journey'),
  feature: Schema.String,
  step: Schema.Finite,
  name: Schema.String,
  action: Schema.String,
  paths: Schema.Record(Schema.String, Schema.String),
  message: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(SimError),
  ms: Schema.Finite,
});

/** The journey's last line: how many steps ran, and the one that failed. */
const Summary = Schema.Struct({
  ok: Schema.Boolean,
  command: Schema.Literal('journey'),
  feature: Schema.String,
  steps: Schema.Finite,
  failedStep: Schema.optionalKey(Schema.Finite),
  failedName: Schema.optionalKey(Schema.String),
  ms: Schema.Finite,
});

/** Any line `sim journey` prints. */
export const JourneyLine = Schema.Union([StepLine, Summary]);

const encodeStep = Schema.encodeSync(Schema.fromJsonString(StepLine));
const encodeSummary = Schema.encodeSync(Schema.fromJsonString(Summary));

/** Run step `index`: its action, its expects, then its receipts, failed or not. */
const runStep = (d: DriveMembers, place: Place, journey: Journey, step: Step, index: number) =>
  Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    const done = yield* Effect.result(
      hostFailed(
        Effect.gen(function* () {
          const checked = yield* act(d, place, step);
          for (const expect of step.expect.slice(checked)) {
            yield* meet(d, place, expect, step.timeout ?? STEP_SECONDS);
          }
        }),
      ),
    );
    const name = `${journey.feature}-${String(index + 1).padStart(2, '0')}-${step.name}`;
    const taken = yield* Effect.result(hostFailed(receipts(d, place, name, step.receipt)));
    const ms = (yield* Clock.currentTimeMillis) - started;
    // The action's or an expect's error first; a receipt's only when the step itself passed.
    const failure = Option.orElse(Result.getFailure(done), () => Result.getFailure(taken));
    const line = encodeStep({
      ok: Option.isNone(failure),
      command: 'journey',
      feature: journey.feature,
      step: index + 1,
      name: step.name,
      action: step.action,
      paths: Result.getOrElse(taken, () => ({})),
      ...Option.match(failure, {
        onNone: () => ({}),
        onSome: (error) => ({ message: error.message, error }),
      }),
      ms,
    });
    return { line, failure };
  });

/**
 * Run `journey` on the booted drive: a video from start to end (unless
 * `video` is false; it is stopped whatever happens), each step in order
 * until one fails, then the summary. A failed step fails the run with its
 * error.
 */
export const runJourney = (place: Place, journey: Journey, session: Session, video: boolean) =>
  hostFailed(
    Effect.gen(function* () {
      const d = yield* Drive;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const started = yield* Clock.currentTimeMillis;
      yield* fs.makeDirectory(session.out, { recursive: true });
      const results = path.join(session.out, 'results.jsonl');
      const emit = (line: string) =>
        Console.log(line).pipe(
          Effect.andThen(fs.writeFileString(results, `${line}\n`, { flag: 'a' })),
        );
      const steps = Effect.gen(function* () {
        for (const [index, step] of journey.steps.entries()) {
          const { line, failure } = yield* runStep(d, place, journey, step, index);
          yield* emit(line);
          if (Option.isSome(failure)) {
            return { ran: index + 1, failed: Option.some({ step, error: failure.value }) };
          }
        }
        return {
          ran: journey.steps.length,
          failed: Option.none<{ readonly step: Step; readonly error: SimError }>(),
        };
      });
      const start = d.record(place, 'start', Option.some(journey.feature)).pipe(
        hostFailed,
        Effect.tapError((error) =>
          emit(
            encodeFailure({ ok: false, command: 'journey', message: error.message, error, ms: 0 }),
          ),
        ),
      );
      const stop = Effect.ignore(d.record(place, 'stop', Option.none()));
      const recorded = Effect.acquireUseRelease(
        start,
        () => steps,
        () => stop,
      );
      let run: typeof recorded = steps;
      if (video) run = recorded;
      const ran = yield* run;
      yield* emit(
        encodeSummary({
          ok: Option.isNone(ran.failed),
          command: 'journey',
          feature: journey.feature,
          steps: ran.ran,
          ...Option.match(ran.failed, {
            onNone: () => ({}),
            onSome: ({ step }) => ({ failedStep: ran.ran, failedName: step.name }),
          }),
          ms: (yield* Clock.currentTimeMillis) - started,
        }),
      );
      if (Option.isSome(ran.failed)) return yield* ran.failed.value.error;
    }),
  );
