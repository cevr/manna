import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import {
  Array as Arr,
  Clock,
  Console,
  Duration,
  Effect,
  FileSystem,
  Option,
  Order,
  Path,
  Schema,
} from 'effect';
import { Command, Flag } from 'effect/cli';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { type Timeline, timelineOf } from '../src/follow/timeline.ts';
import { countInOf } from '../src/player/countin.ts';
import { Choice, cutOf, keptOf } from '../src/player/stanzas.ts';
import { readTiming } from '../vite/timing.ts';
import { readWords } from '../vite/words.ts';
import { judge, type Sample, sampleOf, soundOff } from './follow/samples.ts';
import { succeed } from './sim/tools.ts';

const RectSchema = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  width: Schema.Finite,
  height: Schema.Finite,
});

const Snapshot = Schema.Struct({
  data: Schema.Struct({
    nodes: Schema.Array(
      Schema.Struct({
        index: Schema.optional(Schema.Int),
        parentIndex: Schema.optional(Schema.Int),
        identifier: Schema.optional(Schema.String),
        label: Schema.optional(Schema.String),
        value: Schema.optional(Schema.String),
        selected: Schema.optional(Schema.Boolean),
        rect: Schema.optional(RectSchema),
      }),
    ),
  }),
});

const decodeSnapshot = Schema.decodeUnknownEffect(Schema.fromJsonString(Snapshot));

const Verdict = Schema.Struct({
  hymn: Schema.Int,
  samples: Schema.Int,
  lines: Schema.Int,
  seen: Schema.Int,
  missed: Schema.Array(Schema.Int),
  backwards: Schema.Int,
  last: Schema.Boolean,
  skipped: Schema.Int,
  outside: Schema.Int,
  doubled: Schema.Int,
  mismatched: Schema.Int,
  adrift: Schema.Int,
  early: Schema.Boolean,
  ended: Schema.Boolean,
  touches: Schema.Int,
  holds: Schema.Boolean,
});

const Record = Schema.Struct({
  verdict: Verdict,
  samples: Schema.Array(
    Schema.Struct({
      at: Schema.Finite,
      lines: Schema.Array(Schema.Struct({ selected: Schema.Boolean, rect: RectSchema })),
      scroll: Schema.Union([RectSchema, Schema.Literal(false)]),
      ended: Schema.Boolean,
    }),
  ),
});

const encodeVerdict = Schema.encodeSync(Schema.fromJsonString(Verdict));
const encodeRecord = Schema.encodeSync(Schema.fromJsonString(Record));

class FollowFailed extends Schema.TaggedError<FollowFailed>()('FollowFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

const short = Duration.seconds(30);

const OVER = Duration.minutes(1);

const quoted = (value: string) => `"${value.replaceAll('"', '\\"')}"`;

const nodesNow = Effect.fn('Follow.nodesNow')(function* (session: string) {
  const output = yield* succeed(
    'agent-device',
    ['snapshot', '--json', '--raw', '--observe-only', '--force-full', '--session', session],
    short,
  );
  const snapshot = yield* decodeSnapshot(output).pipe(
    Effect.mapError(() => FollowFailed.make({ reason: 'a snapshot did not decode' })),
  );
  return snapshot.data.nodes;
});

const recording = <A, E, R>(udid: string, video: string, drive: Effect.Effect<A, E, R>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const recorder = yield* spawner.spawn(
        ChildProcess.make(
          'xcrun',
          ['simctl', 'io', udid, 'recordVideo', '--codec', 'h264', '--force', video],
          { detached: false, forceKillAfter: '10 seconds' },
        ),
      );
      yield* Effect.sleep(Duration.millis(1500));
      const result = yield* drive;
      yield* recorder.kill({ killSignal: 'SIGINT', forceKillAfter: '10 seconds' });
      yield* recorder.exitCode;
      return result;
    }),
  );

export const videoOf = (out: string, hymn: number, noVideo: boolean): Option.Option<string> =>
  Option.liftPredicate(`${out.replace(/\/+$/, '')}/follow-${hymn}.mp4`, () => !noVideo);

export const choiceOf = (list: string) => {
  const numbers = list
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(Number);
  return Schema.decodeOption(Choice)(Arr.sort(Arr.dedupe(numbers), Order.Number));
};

export const countInMsOf = (timeline: Timeline, counts: boolean): number => {
  if (!counts) return 0;
  const { beats, beatMs } = countInOf(timeline.tempo);
  return beats * beatMs;
};

export const sungOf = Effect.fn('Follow.sungOf')(function* (
  hymn: number,
  timeline: Timeline,
  list: string,
) {
  const choice = yield* Effect.fromOption(choiceOf(list)).pipe(
    Effect.mapError(() =>
      FollowFailed.make({ reason: `--stanzas ${list} is not a list of stanza numbers` }),
    ),
  );
  if (choice.length === 0) return timeline;
  const text = yield* Arr.findFirst(readWords(), (words) => words.number === hymn).pipe(
    Effect.fromOption,
    Effect.mapError(() => FollowFailed.make({ reason: `hymn ${hymn} has no words` })),
  );
  const kept = keptOf(text.sections, choice);
  if (kept.length !== timeline.lines.length)
    return yield* FollowFailed.make({
      reason: `hymn ${hymn}'s words have ${kept.length} lines, its timeline ${timeline.lines.length}`,
    });
  return cutOf(timeline, kept).timeline;
});

const play = Effect.fn('Follow.play')(function* (
  session: string,
  hymn: number,
  every: number,
  limit: number,
) {
  yield* succeed(
    'agent-device',
    ['press', `label=${quoted(`Play hymn ${hymn}`)}`, '--session', session],
    short,
  );
  const start = yield* Clock.currentTimeMillis;
  const samples: Array<Sample> = [];
  let ended = false;
  let at = 0;
  while (!ended && at < limit) {
    const nodes = yield* nodesNow(session);
    at = (yield* Clock.currentTimeMillis) - start;
    const sample = sampleOf(nodes, hymn, at);
    samples.push(sample);
    ended = sample.ended;
    const spent = (yield* Clock.currentTimeMillis) - start - at;
    yield* Effect.sleep(Duration.millis(Math.max(0, every - spent)));
  }
  return samples;
});

const follow = Command.make(
  'follow',
  {
    udid: Flag.String('udid').pipe(Flag.withDescription('the booted simulator')),
    hymn: Flag.Int('hymn').pipe(Flag.withDescription('the hymn whose page is open')),
    out: Flag.String('out').pipe(Flag.withDescription('where the video and the samples go')),
    every: Flag.Int('every').pipe(
      Flag.withDefault(500),
      Flag.withDescription('ms between snapshots'),
    ),
    session: Flag.String('session').pipe(
      Flag.withDefault('verify-hymnal'),
      Flag.withDescription("agent-device's session, the sim helper's by default"),
    ),
    noVideo: Flag.Boolean('no-video').pipe(
      Flag.withDefault(false),
      Flag.withDescription('record no video of the screen; only the tree is read'),
    ),
    stanzas: Flag.String('stanzas').pipe(
      Flag.withDefault(''),
      Flag.withDescription(
        "the stanzas the app's player sheet has chosen for the hymn, comma-separated; every one by default",
      ),
    ),
    noCountIn: Flag.Boolean('no-count-in').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        "judge a run with the app's Intro off: the score clock runs from the tap, with no count-in",
      ),
    ),
  },
  (flags) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.makeDirectory(flags.out, { recursive: true });
      const full = yield* Arr.findFirst(readTiming(), ([number]) => number === flags.hymn).pipe(
        Option.flatMap(([, encoded]) => timelineOf(encoded)),
        Effect.fromOption,
        Effect.mapError(() => FollowFailed.make({ reason: `hymn ${flags.hymn} has no timeline` })),
      );
      const timeline = {
        ...(yield* sungOf(flags.hymn, full, flags.stanzas)),
        countIn: countInMsOf(full, !flags.noCountIn),
      };
      const before = yield* nodesNow(flags.session);
      if (!before.some((node) => node.label === `Play hymn ${flags.hymn}`))
        return yield* FollowFailed.make({ reason: `the page shows no Play hymn ${flags.hymn}` });
      if (!soundOff(before))
        return yield* FollowFailed.make({ reason: 'sound is not off: Play is not pressed' });
      const limit = timeline.countIn + timeline.end - timeline.first + Duration.toMillis(OVER);
      const drive = play(flags.session, flags.hymn, flags.every, limit);
      const samples = yield* Option.match(videoOf(flags.out, flags.hymn, flags.noVideo), {
        onNone: () => drive,
        onSome: (video) => recording(flags.udid, video, drive),
      });
      const verdict = judge(flags.hymn, timeline, samples, 1);
      yield* fs.writeFileString(
        path.join(flags.out, `follow-${flags.hymn}.json`),
        encodeRecord({ verdict, samples }),
      );
      yield* Console.log(encodeVerdict(verdict));
      if (!verdict.holds) return yield* FollowFailed.make({ reason: 'the follow did not hold' });
    }),
);

if (import.meta.main)
  Command.run(follow, { version: '1.0.0' }).pipe(Effect.provide(BunServices.layer), (program) =>
    BunRuntime.runMain(program),
  );
