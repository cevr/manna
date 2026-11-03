import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Duration, Effect, FileSystem, Option, Path, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { attempt, succeed } from './sim/tools.ts';
import {
  coverIn,
  coversOf,
  holds,
  judge,
  type Layout,
  linesIn,
  listShows,
  summarize,
  type Verdict,
} from './sticky/frames.ts';

const APP_ID = 'im.cvr.hymnal';
const SESSION = 'sticky-check';
const PASSES = ['slow', 'fast', 'push'] as const;
type Pass = (typeof PASSES)[number];

const Line = Schema.Struct({
  pass: Schema.Literals(PASSES),
  run: Schema.Int,
  frames: Schema.Int,
  shown: Schema.Int,
  judged: Schema.Int,
  missing: Schema.Int,
  off: Schema.Int,
  worst: Schema.Finite,
});

const Record = Schema.Struct({
  ...Line.fields,
  layout: Schema.Struct({
    scale: Schema.Finite,
    top: Schema.Finite,
    topic: Schema.Finite,
    hymn: Schema.Finite,
    field: Schema.Finite,
  }),
  verdicts: Schema.Array(
    Schema.Union([
      Schema.TaggedStruct('Missing', {}),
      Schema.TaggedStruct('Covered', {}),
      Schema.TaggedStruct('Seen', {
        pinned: Schema.Finite,
        pushed: Schema.Boolean,
        expected: Schema.Finite,
        deviation: Schema.Finite,
      }),
    ]),
  ),
});

const encodeLine = Schema.encodeSync(Schema.fromJsonString(Line));
const encodeRecord = Schema.encodeSync(Schema.fromJsonString(Record));

class StickyFailed extends Schema.TaggedError<StickyFailed>()('StickyFailed', {}) {
  override get message() {
    return 'a pass has a frame off its place, or too few frames judged';
  }
}

interface Column {
  readonly edge: 'left' | 'right';
  readonly x: number;
  readonly width: number;
  readonly band: number;
}

const cropX = { left: (px: number) => `${px}`, right: (px: number) => `iw-${px}` };

const PINNED: Column = { edge: 'left', x: 4, width: 8, band: 260 };

const FIELD: Column = { edge: 'right', x: 40, width: 8, band: 140 };

const WITNESS: Column = { edge: 'right', x: 12, width: 8, band: 600 };

const PUSH_SHOWN = 0.2;

const LEAST: Record<Pass, number> = { slow: 1, fast: 1, push: PUSH_SHOWN };

const shownIn = Effect.fn('Sticky.shownIn')(function* (
  video: string,
  layout: Layout,
  pass: Pass,
  frames: number,
) {
  if (pass !== 'push') return Array.from({ length: frames }, () => true);
  const witness = yield* columns(video, layout, WITNESS);
  return witness.map((rows) => listShows(linesIn(rows, layout.scale), layout));
});

const short = Duration.seconds(30);

const device = (args: ReadonlyArray<string>) =>
  succeed('agent-device', [...args, '--session', SESSION], short);

const pan = (x: number, y: number, dx: number, dy: number, ms: number) =>
  device(['gesture', 'pan', `${x}`, `${y}`, `${dx}`, `${dy}`, `${ms}`]);

const pause = (ms: number) => Effect.sleep(Duration.millis(ms));

const launch = Effect.fn('Sticky.launch')(function* (udid: string, pass: Pass) {
  yield* attempt('xcrun', ['simctl', 'terminate', udid, APP_ID], short);
  yield* device(['open', APP_ID, '--platform', 'ios', '--udid', udid, '--relaunch']);
  yield* pause(3000);
  if (pass === 'fast') {
    for (let i = 0; i < 8; i++) yield* pan(200, 760, 0, -560, 400);
  } else yield* pan(200, 700, 0, -500, 600);
  yield* pause(1500);
});

const gestures = Effect.fn('Sticky.gestures')(function* (pass: Pass) {
  if (pass === 'slow') {
    for (let i = 0; i < 3; i++) yield* pan(200, 700, 0, -360, 1200);
    yield* pause(500);
    for (let i = 0; i < 2; i++) yield* pan(200, 300, 0, 360, 1200);
    yield* pause(500);
    yield* device(['gesture', 'fling', 'up', '200', '650', '420']);
    yield* pause(2000);
    yield* device(['gesture', 'fling', 'down', '200', '300', '300']);
    yield* pause(2000);
  }
  if (pass === 'fast') {
    for (let i = 0; i < 6; i++) yield* pan(200, 760, 0, -560, 250);
    for (let i = 0; i < 6; i++) yield* pan(200, 200, 0, 560, 250);
  }
  if (pass === 'push') {
    yield* device(['press', '200', '520']);
    yield* pause(2000);
    yield* device(['press', '30', '80']);
    yield* pause(2000);
    yield* device(['press', '200', '520']);
    yield* pause(2000);
    yield* device(['back', '--in-app']);
    yield* pause(2000);
  }
  yield* pause(1000);
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
      yield* pause(1500);
      const result = yield* drive;
      yield* recorder.kill({ killSignal: 'SIGINT', forceKillAfter: '10 seconds' });
      yield* recorder.exitCode;
      return result;
    }),
  );

const columns = Effect.fn('Sticky.columns')(function* (
  video: string,
  layout: Layout,
  column: Column,
) {
  const fs = yield* FileSystem.FileSystem;
  const x = cropX[column.edge](Math.round(column.x * layout.scale));
  const width = Math.round(column.width * layout.scale);
  const height = Math.round(column.band * layout.scale);
  const raw = `${video}.${column.edge}.gray`;
  yield* succeed(
    'ffmpeg',
    [
      '-v',
      'error',
      '-y',
      '-i',
      video,
      '-vf',
      `crop=${width}:${height}:${x}:0,format=gray`,
      '-fps_mode',
      'passthrough',
      '-f',
      'rawvideo',
      raw,
    ],
    Duration.minutes(5),
  );
  const bytes = yield* fs.readFile(raw);
  yield* fs.remove(raw);
  const size = width * height;
  return Array.from({ length: Math.floor(bytes.length / size) }, (_, frame) =>
    Array.from({ length: height }, (_, y) => {
      let sum = 0;
      for (let c = 0; c < width; c++) sum += bytes[frame * size + y * width + c] ?? 0;
      return sum / width;
    }),
  );
});

const check = Effect.fn('Sticky.check')(function* (
  udid: string,
  pass: Pass,
  run: number,
  out: string,
  layout: Layout,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const video = path.join(out, `${pass}-${run}.mp4`);
  yield* launch(udid, pass);
  yield* recording(udid, video, gestures(pass));
  yield* Effect.ignore(device(['close']));
  const pinned = yield* columns(video, layout, PINNED);
  const shows = yield* shownIn(video, layout, pass, pinned.length);
  const field = yield* columns(video, layout, FIELD);
  const covers = coversOf(field.map((rows) => coverIn(rows, layout)));
  const verdicts = pinned.map((rows, frame): Verdict => {
    if (shows[frame] !== true) return { _tag: 'Covered' };
    return judge(linesIn(rows, layout.scale), layout, covers[frame] ?? Option.some(0));
  });
  const summary = summarize(verdicts);
  yield* fs.writeFileString(
    path.join(out, `${pass}-${run}.json`),
    encodeRecord({ pass, run, layout, ...summary, verdicts }),
  );
  if (pass === 'push') yield* succeed('trash', [video], short);
  yield* Console.log(encodeLine({ pass, run, ...summary }));
  return holds(summary, LEAST[pass]);
});

const sticky = Command.make(
  'sticky',
  {
    udid: Flag.String('udid').pipe(Flag.withDescription('the simulator to drive')),
    app: Flag.String('app').pipe(
      Flag.optional,
      Flag.withDescription('a Release Hymnal.app to install first'),
    ),
    pass: Flag.Literals('pass', [...PASSES, 'all']).pipe(Flag.withDefault('all')),
    runs: Flag.Int('runs').pipe(Flag.withDefault(1)),
    out: Flag.String('out').pipe(Flag.withDescription('where the videos and frame verdicts go')),
    scale: Flag.Int('scale').pipe(Flag.withDefault(3)),
    top: Flag.Finite('top').pipe(
      Flag.withDefault(62),
      Flag.withDescription("the list's top in pt: the safe-area inset"),
    ),
    topic: Flag.Finite('topic').pipe(
      Flag.withDefault(36),
      Flag.withDescription("a topic row's height in pt: ceil(20 × fontScale) + 16"),
    ),
    hymn: Flag.Finite('hymn').pipe(
      Flag.withDefault(44),
      Flag.withDescription("a hymn row's height in pt: ceil(22 × fontScale) + 22"),
    ),
    field: Flag.Finite('field').pipe(
      Flag.withDefault(52),
      Flag.withDescription(
        "the search field's layer over the list's top in pt: ceil(22 × fontScale) + 30",
      ),
    ),
  },
  (flags) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(flags.out, { recursive: true });
      if (Option.isSome(flags.app))
        yield* succeed(
          'xcrun',
          ['simctl', 'install', flags.udid, flags.app.value],
          Duration.minutes(2),
        );
      const layout: Layout = {
        scale: flags.scale,
        top: flags.top,
        topic: flags.topic,
        hymn: flags.hymn,
        field: flags.field,
      };
      const passes = PASSES.filter((pass) => flags.pass === 'all' || flags.pass === pass);
      let held = true;
      for (let run = 1; run <= flags.runs; run++)
        for (const pass of passes)
          held = (yield* check(flags.udid, pass, run, flags.out, layout)) && held;
      if (!held) return yield* StickyFailed.make({});
    }).pipe(Effect.ensuring(Effect.ignore(device(['close'])))),
);

Command.run(sticky, { version: '1.0.0' }).pipe(Effect.provide(BunServices.layer), (program) =>
  BunRuntime.runMain(program),
);
