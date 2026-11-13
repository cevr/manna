/**
 * `sim journeys <file>.md`: a feature file's journey lists, each played in
 * one app session in its written order from the start state it names, so a
 * journey that leaves the app where the next one does not expect it fails
 * where a verifier driving by hand once found it. Each list is a line of
 * the feature file, as:
 *
 * **Journeys in order:** from a fresh install: `first`, `home-field`, `7 min`, `home-dot`.
 *
 * **Journeys in order:** from a relaunch, the store set to `chords=false`: `about`, `browse`.
 *
 * A start is `from a fresh install` (the installed build installed again,
 * with no file it kept) or `from a relaunch`; `the store set to` writes each
 * `key=value` into the app's stored settings before the launch; a
 * `<n> min` item waits that long. The journeys keep no shot and take no
 * video, and each one runs whether the one before it passed or not; the
 * last line names, for each journey, its first failed step and the journey
 * that ran before it.
 */
import {
  Array as Arr,
  Clock,
  Console,
  Duration,
  Effect,
  FileSystem,
  Option,
  Path,
  Result,
  Schema,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';

import { Drive, type Place } from './drive.ts';
import { BadJourney, hostError, NotOnPlatform, SimError } from './errors.ts';
import { admit } from './host.ts';
import { loadJourney, playJourney } from './journey.ts';
import { encodeFailure } from './result.ts';

/** Where a run starts. */
type Start = 'fresh install' | 'relaunch';

/** One item of a list: a journey to play, or minutes to wait. */
type Item =
  | { readonly kind: 'journey'; readonly feature: string }
  | { readonly kind: 'wait'; readonly minutes: number };

/** One journey list: its line in the file, its start, the settings it sets, its items in order. */
interface Run {
  readonly line: number;
  readonly start: Start;
  readonly store: ReadonlyArray<readonly [string, string]>;
  readonly items: ReadonlyArray<Item>;
}

const LIST = /^\s*(?:[-*]\s+)?\*\*Journeys in order:\*\*\s*(.*)$/;
const HEAD = /^from a (fresh install|relaunch)(?:, the store set to (.+))?$/;
const TICKED = /`([^`]*)`/g;
const SEPARATOR = /^[\s,.;]*(?:(?:and|then)[\s,.;]*)?$/;
const FEATURE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WAIT = /^(\d+) min$/;
const SETTING = /^([^=\s]+)=(.+)$/;
const FILE = /^[a-zA-Z0-9-]+\.md$/;

/** The backticked words of `text`; none when any text between them is no separator. */
const ticked = (text: string): Option.Option<ReadonlyArray<string>> => {
  const words: Array<string> = [];
  let last = 0;
  for (const match of text.matchAll(TICKED)) {
    if (!SEPARATOR.test(text.slice(last, match.index))) return Option.none();
    words.push(match[1] ?? '');
    last = match.index + match[0].length;
  }
  if (!SEPARATOR.test(text.slice(last))) return Option.none();
  return Option.some(words);
};

/** The index of the first `:` outside backticks, or -1. */
const colonAt = (text: string) => {
  let inside = false;
  for (const [index, char] of [...text].entries()) {
    if (char === '`') inside = !inside;
    if (char === ':' && !inside) return index;
  }
  return -1;
};

/** The groups of `pattern`'s match in `text`, the whole match first; none when it does not match. */
const groups = (pattern: RegExp, text: string): Option.Option<ReadonlyArray<string>> =>
  Option.map(Option.fromNullishOr(pattern.exec(text)), (match) =>
    match.map((group) => group ?? ''),
  );

/** The `key=value` words of a store set; none when any word is not one. */
const settings = (text: string): Option.Option<ReadonlyArray<readonly [string, string]>> =>
  Option.flatMap(ticked(text), (words) => {
    const pairs = words.flatMap((word) =>
      Option.match(groups(SETTING, word), {
        onNone: () => [],
        onSome: ([, key = '', value = '']) => [[key, value] as const],
      }),
    );
    if (pairs.length === 0 || pairs.length !== words.length) return Option.none();
    return Option.some(pairs);
  });

/** One list's line, read; its problem in words when it is no list. */
const readLine = (text: string, line: number): Result.Result<Run, string> => {
  const refuse = (problem: string) => Result.fail(`line ${line}: ${problem}`);
  const at = colonAt(text);
  if (at < 0) return refuse("no ':' after its start");
  const head = groups(HEAD, text.slice(0, at).trim());
  if (Option.isNone(head))
    return refuse("its start is not 'from a fresh install' or 'from a relaunch'");
  const [, from = '', setText = ''] = head.value;
  let store: ReadonlyArray<readonly [string, string]> = [];
  if (setText !== '') {
    const set = settings(setText);
    if (Option.isNone(set)) return refuse('the store is set by `key=value` words only');
    store = set.value;
  }
  const words = ticked(text.slice(at + 1));
  if (Option.isNone(words)) return refuse('its items are backticked words only');
  const items: Array<Item> = [];
  for (const word of words.value) {
    const wait = groups(WAIT, word);
    if (Option.isSome(wait)) items.push({ kind: 'wait', minutes: Number(wait.value[1]) });
    else if (FEATURE.test(word)) items.push({ kind: 'journey', feature: word });
    else return refuse(`\`${word}\` is no journey name and no \`<n> min\``);
  }
  if (!items.some((item) => item.kind === 'journey')) return refuse('it names no journey');
  let start: Start = 'relaunch';
  if (from === 'fresh install') start = 'fresh install';
  return Result.succeed({ line, start, store, items });
};

/** Every journey list of a feature file's text, in written order; a file with none, or a bad one, is refused. */
export const readJourneyLists = (file: string, text: string) =>
  Effect.gen(function* () {
    const runs: Array<Run> = [];
    for (const [index, line] of text.split('\n').entries()) {
      const list = groups(LIST, line);
      if (Option.isNone(list)) continue;
      const read = readLine(list.value[1] ?? '', index + 1);
      if (Result.isFailure(read)) return yield* BadJourney.make({ file, issue: read.failure });
      runs.push(read.success);
    }
    if (runs.length === 0)
      return yield* BadJourney.make({ file, issue: 'it holds no **Journeys in order:** line' });
    return runs;
  });

/** How one journey of a run ended, and what ran before it. */
const Outcome = Schema.Struct({
  feature: Schema.String,
  ok: Schema.Boolean,
  /** The line of the file its list is on. */
  line: Schema.Finite,
  /** The journey that ran before it in its list, or the list's start. */
  after: Schema.String,
  steps: Schema.Finite,
  failedStep: Schema.optionalKey(Schema.Finite),
  failedName: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(SimError),
});
type Outcome = typeof Outcome.Type;

/** The last line: every journey's outcome, in the order they ran. */
const Summary = Schema.Struct({
  ok: Schema.Boolean,
  command: Schema.Literal('journeys'),
  file: Schema.String,
  journeys: Schema.Array(Outcome),
  ms: Schema.Finite,
});

const encodeSummary = Schema.encodeSync(Schema.fromJsonString(Summary));

const hostFailed = <A, R>(step: Effect.Effect<A, SimError | PlatformError, R>) =>
  step.pipe(Effect.catchTag('PlatformError', (error) => Effect.fail(hostError(error))));

/** Seconds a fresh install waits for the app's ready target. */
const FRESH_SECONDS = 180;

/** Bring the app to a run's start: installed afresh or relaunched, its settings set first when the run asks. */
const begin = (place: Place, run: Run) =>
  Effect.gen(function* () {
    const d = yield* Drive;
    if (run.start === 'fresh install') yield* d.freshInstall(place, FRESH_SECONDS);
    if (run.store.length > 0) yield* d.setStore(place, run.store);
    if (run.start === 'relaunch' || run.store.length > 0) yield* d.relaunch(place);
  });

/** The lists of `name` in the features folder, read, for the booted iOS drive; its failure printed. */
const prepare = (place: Place, name: string) =>
  hostFailed(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const file = path.join(place.features, name);
      if (!FILE.test(name))
        return yield* BadJourney.make({
          file,
          issue: `${name} is no feature file name (<name>.md)`,
        });
      const text = yield* fs
        .readFileString(file)
        .pipe(Effect.mapError((error) => BadJourney.make({ file, issue: error.message })));
      const runs = yield* readJourneyLists(file, text);
      const store = Option.fromNullishOr(place.config.store);
      if (runs.some((run) => run.store.length > 0) && Option.isNone(store))
        return yield* BadJourney.make({
          file,
          issue: `${place.config.displayName} names no store, so no list can set one`,
        });
      const session = yield* (yield* Drive).readSession(place);
      if (session.platform !== 'ios')
        return yield* NotOnPlatform.make({ command: 'journeys', platform: session.platform });
      yield* admit(session.out);
      return { file, runs, session };
    }),
  ).pipe(
    Effect.tapError((error) =>
      Console.log(
        encodeFailure({ ok: false, command: 'journeys', message: error.message, error, ms: 0 }),
      ),
    ),
  );

/**
 * Play every list of `name` (a `.md` file in the features folder) on the
 * booted iOS drive, then print the summary and append it to
 * `<out>/results.jsonl`; it fails with the first failed journey's error. A
 * run whose start fails reports each of its journeys failed with that
 * error, and plays none of them.
 */
export const runJourneyLists = (place: Place, name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const started = yield* Clock.currentTimeMillis;
    const { file, runs, session } = yield* prepare(place, name);
    const outcomes: Array<Outcome> = [];
    for (const run of runs) {
      const begun = yield* Effect.result(hostFailed(begin(place, run)));
      let after = `from a ${run.start}`;
      for (const item of run.items) {
        if (item.kind === 'wait') {
          if (Result.isSuccess(begun)) yield* Effect.sleep(Duration.minutes(item.minutes));
          continue;
        }
        const base = { feature: item.feature, line: run.line, after };
        after = item.feature;
        if (Result.isFailure(begun)) {
          outcomes.push({ ...base, ok: false, steps: 0, error: begun.failure });
          continue;
        }
        const played = yield* Effect.result(
          hostFailed(
            Effect.flatMap(loadJourney(place, item.feature, false), ({ journey }) =>
              playJourney(place, journey, session, false),
            ),
          ),
        );
        if (Result.isFailure(played)) {
          outcomes.push({ ...base, ok: false, steps: 0, error: played.failure });
          continue;
        }
        const { ran, failed } = played.success;
        outcomes.push({
          ...base,
          ok: Option.isNone(failed),
          steps: ran,
          ...Option.match(failed, {
            onNone: () => ({}),
            onSome: ({ step, error }) => ({ failedStep: ran, failedName: step.name, error }),
          }),
        });
      }
    }
    const line = encodeSummary({
      ok: outcomes.every((outcome) => outcome.ok),
      command: 'journeys',
      file,
      journeys: outcomes,
      ms: (yield* Clock.currentTimeMillis) - started,
    });
    yield* Console.log(line);
    yield* hostFailed(
      fs.writeFileString(`${session.out}/results.jsonl`, `${line}\n`, { flag: 'a' }),
    );
    const failures = outcomes.flatMap((outcome) =>
      Option.toArray(Option.fromNullishOr(outcome.error)),
    );
    const first = Arr.head(failures);
    if (Option.isSome(first)) return yield* first.value;
  });
