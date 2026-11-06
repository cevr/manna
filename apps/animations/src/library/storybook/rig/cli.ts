import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { decodePng, type Raster } from '@manna/film/tools';
import { Console, Effect, FileSystem, Layer, Option, Path, Result, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import sharp from 'sharp';
import { CELLS as LEAD_TABLE } from '../../cast/lead-feast/shot-sheets/iio-table/cells.ts';
import { CUTS } from '../../../films/in-its-order/cast/lead-table-rig/cutout/cut.ts';
import { filmCast, filmFolder, filmNamed, filmShot } from '../films.ts';
import type { PaintScene } from '../painter.ts';
import {
  APP,
  encodeClip,
  frameName,
  loadShot,
  requestOf,
  storybookPage,
  StorybookFailed,
} from '../render.ts';
import { breathPeriodOf, drawnKeyOf, frameAt, type Shot, startOf, timesOf } from '../shot.ts';
import { drawnCellOf } from '../store.ts';
import {
  PARENTS,
  RIG_PARTS,
  RIG_REST,
  type RigClock,
  type RigPart,
  type RigPose,
  rigPoseAt,
} from './channels.ts';
import { loadRigSheet, paintRigOf } from './load.ts';

/** JSON as the rig's records are written: two-space indented. */
const jsonOf = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown, { space: 2 }));

/** The film, the shot, the figure the rig draws, its rigged cell and the window: in-its-order's cold-table, from its start (`grown`) for 5 s. */
const PROTO = {
  film: 'in-its-order',
  shot: 'cold-table',
  figure: 'lead',
  cell: 'bottle',
  seconds: 5,
  stress: 'stare',
} as const;

/** The lead's table part sheet, cut by `concept parts` (`films/in-its-order/cast/lead-table-rig/cutout/sheets/single-1/`). */
const SHEET = `${APP}/src/films/in-its-order/cast/lead-table-rig/cutout/sheets/single-1`;

/** A channel the stills show at its largest excursion: its name, its part, and how far it is from rest in a pose. */
const CHANNELS: ReadonlyArray<{
  readonly name: string;
  readonly part: RigPart;
  readonly from: (p: RigPose) => number;
}> = [
  { name: 'body-breath', part: 'body', from: (p) => p.body.sy - 1 },
  { name: 'body-lean', part: 'body', from: (p) => p.body.angle },
  { name: 'head', part: 'head', from: (p) => p.head.angle },
  { name: 'hand', part: 'armLeft', from: (p) => p.armLeft.angle },
  { name: 'hand-lift', part: 'armLeft', from: (p) => p.armLeft.dy },
  { name: 'cloth', part: 'clothSash', from: (p) => p.clothSash.angle },
];

/** The rig with every channel at its own largest excursion over the window at once. */
const allAtOnce = (poses: ReadonlyArray<RigPose>): RigPose => {
  const most = (read: (p: RigPose) => number) =>
    poses.map(read).reduce((a, b) => [a, b][Number(Math.abs(b) > Math.abs(a))] ?? a, 0);
  return {
    body: {
      ...RIG_REST.body,
      angle: most((p) => p.body.angle),
      sy: 1 + most((p) => p.body.sy - 1),
    },
    head: { ...RIG_REST.head, angle: most((p) => p.head.angle) },
    armLeft: {
      ...RIG_REST.armLeft,
      angle: most((p) => p.armLeft.angle),
      dy: most((p) => p.armLeft.dy),
    },
    armRight: RIG_REST.armRight,
    clothSash: { ...RIG_REST.clothSash, angle: most((p) => p.clothSash.angle) },
  };
};

/** Runs ffmpeg with `args`, failing on a non-zero exit. */
const ffmpeg = Effect.fn('Storybook.rig.ffmpeg')(function* (args: ReadonlyArray<string>) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const code = yield* spawner.exitCode(
    ChildProcess.make('ffmpeg', ['-y', '-loglevel', 'error', ...args], {
      forceKillAfter: '5 seconds',
    }),
  );
  if (code !== 0)
    return yield* StorybookFailed.make({ reason: `ffmpeg exited ${code}: ${args.join(' ')}` });
});

/** A label's picture: `text` in dark ink on a pale band, as a PNG. */
const labelPng = (text: string) =>
  Effect.tryPromise({
    try: () =>
      sharp(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="64"><rect width="260" height="64" rx="10" fill="#fdf7e5" fill-opacity="0.85"/><text x="130" y="44" font-family="Helvetica, Arial, sans-serif" font-size="36" font-weight="bold" text-anchor="middle" fill="#2a1a10">${text}</text></svg>`,
        ),
      )
        .png()
        .toBuffer(),
    catch: (e) => StorybookFailed.make({ reason: `label ${text}: ${String(e)}` }),
  });

/** A frame's PNG bytes read back as a raster. */
const rasterOf = (png: Uint8Array) =>
  Effect.fromResult(
    Result.mapError(decodePng(png), (e) => StorybookFailed.make({ reason: e.message })),
  );

/** Whether pixel `i` of `r` is clear enough to show what lies behind it. */
const clearAt = (r: Raster, i: number) => (r.rgba[i * 4 + 3] ?? 0) < 128;

/** The clear pixels of a figure alone that no clear path reaches from the frame's edge: holes the ground shows through inside the figure. */
const holesOf = (r: Raster): Uint8Array => {
  const { width: w, height: h } = r;
  const reached = new Uint8Array(w * h);
  const stack: Array<number> = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length > 0) {
    const i = stack.pop() ?? 0;
    if (reached[i] === 1 || !clearAt(r, i)) continue;
    reached[i] = 1;
    const [x, y] = [i % w, Math.floor(i / w)];
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  return Uint8Array.from(reached, (m, i) => Number(m === 0 && clearAt(r, i)));
};

/** How far inside the rest silhouette's edge a cleared pixel counts as inside the figure, frame px: past the breath's and the lean's shift of the outline (about 5 px at the crown). */
const INSIDE = 6;

/** The pixels of `mask` whose whole square of `r` px about them is in `mask`, by rows then columns. */
const eroded = (mask: Uint8Array, w: number, h: number, r: number): Uint8Array => {
  const pass = (
    src: Uint8Array,
    along: number,
    across: number,
    at: (a: number, b: number) => number,
  ) => {
    const out = new Uint8Array(src.length);
    for (let b = 0; b < across; b++) {
      let run = 0;
      const runs = new Uint16Array(along);
      for (let a = 0; a < along; a++) {
        run = (run + 1) * (src[at(a, b)] ?? 0);
        runs[a] = run;
      }
      for (let a = r; a < along - r; a++)
        out[at(a, b)] = Number((runs[Math.min(along - 1, a + r)] ?? 0) >= 2 * r + 1);
    }
    return out;
  };
  const rows = pass(mask, w, h, (x, y) => y * w + x);
  return pass(rows, h, w, (y, x) => y * w + x);
};

/** How a posed figure alone differs from it at rest: its holes, the holes it has that rest has not, the rest silhouette's pixels it leaves clear, those of them `INSIDE` px or more within the rest's edge, and its see-through pixels (alpha 1 to 254) enclosed in its silhouette. */
const holeCounts = (rest: Raster, posed: Raster) => {
  const [hr, hp] = [holesOf(rest), holesOf(posed)];
  const solid = Uint8Array.from(hr, (_, i) => Number(!clearAt(rest, i)));
  const deep = eroded(solid, rest.width, rest.height, INSIDE);
  let [restHoles, holes, fresh, uncovered, inside, seams] = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < hp.length; i++) {
    restHoles += hr[i] ?? 0;
    holes += hp[i] ?? 0;
    if (hp[i] === 1 && hr[i] === 0) fresh++;
    if (!clearAt(rest, i) && clearAt(posed, i)) uncovered++;
    if (deep[i] === 1 && clearAt(posed, i)) inside++;
    const a = posed.rgba[i * 4 + 3] ?? 0;
    if (a > 0 && a < 255 && hp[i] === 0) seams++;
  }
  return { restHoles, holes, fresh, uncovered, inside, seams };
};

/** The box of a raster's opaque pixels (alpha 128 up), the far edges exclusive. */
const opaqueBox = (r: Raster) => {
  let [x0, y0, x1, y1] = [r.width, r.height, 0, 0];
  for (let i = 0; i < r.width * r.height; i++)
    if (!clearAt(r, i)) {
      const [x, y] = [i % r.width, Math.floor(i / r.width)];
      [x0, y0, x1, y1] = [
        Math.min(x0, x),
        Math.min(y0, y),
        Math.max(x1, x + 1),
        Math.max(y1, y + 1),
      ];
    }
  return { x0, y0, x1, y1 };
};

/**
 * Renders the prototype's evidence into `out` (the unit dir): the same 5 s
 * of cold-table drawn today (`clips/today.mp4`) and with the lead from parts
 * (`clips/rig.mp4`), both with the take's sound, side by side
 * (`clips/side-by-side.mp4`); the rest pair at the rig's first frame, each
 * channel's extreme and every joint's 1:1 crop at it (`stills/`); the
 * channels as the rig draws them (`channels.json`); and the holes and seams
 * at each extreme (`holes.json`). Frames go under `<scratch>/`.
 */
const run = Effect.fn('Storybook.rig.run')(function* (out: string, scratch: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const story = yield* filmNamed(PROTO.film);
  const placed = yield* filmShot(story, PROTO.shot);
  const cast = yield* filmCast(story);
  const shot: Shot = { ...placed.shot, duration: PROTO.seconds };
  const figure = placed.shot.layers
    .flatMap((l) => l.items)
    .find((i) => i._tag === 'Figure' && i.name === PROTO.figure);
  if (figure?._tag !== 'Figure')
    return yield* StorybookFailed.make({ reason: `${PROTO.shot} has no figure ${PROTO.figure}` });
  const cue = (name: string) => placed.scene.cues.get(name) ?? { start: 0, end: 0 };
  const start = cue(`shot:${PROTO.shot}`).start;
  const clock: RigClock = {
    fps: shot.fps,
    stress: cue(`${PROTO.shot}:${PROTO.stress}`).start - start,
    period: breathPeriodOf(figure.name),
    from: startOf(figure.spans[0]),
  };
  const { figures, heads, shares, scene } = yield* loadShot(shot, cast);
  const stored = figures.find((f) => f.figure.name === PROTO.figure);
  if (!stored) return yield* StorybookFailed.make({ reason: `${PROTO.figure} is not loaded` });
  const blinks = figure.spans.flatMap((s) => {
    if (s._tag !== 'Hold' || s.cell !== PROTO.cell || !s.blink) return [];
    return [`${s.cell}~${s.blink}`];
  });
  const keys = [PROTO.cell, ...new Set(blinks)].flatMap((key) =>
    Option.toArray(Option.map(drawnCellOf(stored, key), (r) => [key, r] as const)),
  );
  const cell = LEAD_TABLE[PROTO.cell];
  const sheet = yield* loadRigSheet(SHEET, CUTS['single-1'], [cell.ax, cell.ay]);
  const rig = paintRigOf(sheet, keys);
  const rigScene: PaintScene = {
    ...scene,
    layers: scene.layers.map((l) => ({
      ...l,
      items: l.items.map((i) => {
        if (i._tag === 'Figure' && i.name === PROTO.figure) return { ...i, rig };
        return i;
      }),
    })),
  };
  const today = yield* storybookPage(scene);
  const rigged = yield* storybookPage(rigScene);
  const times = timesOf(shot);
  const frames = times.map((t) => frameAt(shot, heads, t, shares));
  const poses = times.map((t) => rigPoseAt(clock, t));
  const drawsRig = (i: number) =>
    frames[i]?.figures.some(
      (f) => f.name === PROTO.figure && keys.some(([key]) => key === drawnKeyOf(f)),
    ) ?? false;
  const drawn = times.flatMap((_, i) => [i].filter(drawsRig));
  const first = drawn[0] ?? 0;
  const posedReq = (i: number, pose: RigPose, only: string) => {
    const frame = frames[i] ?? frameAt(shot, heads, 0, shares);
    const req = requestOf(frame, only);
    return {
      ...req,
      figures: req.figures.map((f) => {
        if (f.name !== PROTO.figure || !drawsRig(i)) return f;
        return { ...f, parts: pose };
      }),
    };
  };
  const dirs = {
    today: path.join(scratch, 'today'),
    rig: path.join(scratch, 'rig'),
    clips: path.join(out, 'clips'),
    stills: path.join(out, 'stills'),
  };
  for (const d of Object.values(dirs)) {
    yield* fs.remove(d, { recursive: true, force: true });
    yield* fs.makeDirectory(d, { recursive: true });
  }
  for (const [i] of times.entries()) {
    yield* fs.writeFile(
      path.join(dirs.today, frameName(i)),
      yield* today(requestOf(frames[i] ?? frameAt(shot, heads, 0, shares), 'colour')),
    );
    yield* fs.writeFile(
      path.join(dirs.rig, frameName(i)),
      yield* rigged(posedReq(i, poses[i] ?? RIG_REST, 'colour')),
    );
  }
  yield* Console.log(
    `rig: ${times.length} frames each, the rig drawn on ${first}..${drawn.at(-1)}`,
  );
  const restTime = times[first] ?? 0;
  yield* fs.writeFile(
    path.join(dirs.stills, 'rest-today.png'),
    yield* today(requestOf(frames[first] ?? frameAt(shot, heads, restTime, shares), 'colour')),
  );
  yield* fs.writeFile(
    path.join(dirs.stills, 'rest-rig.png'),
    yield* rigged(posedReq(first, RIG_REST, 'colour')),
  );
  const restAlone = yield* rasterOf(
    yield* rigged(posedReq(first, RIG_REST, `figure:${PROTO.figure}`)),
  );
  const box = opaqueBox(restAlone);
  const cellBox = { x0: 15, y0: 210, x1: 251, y1: 814 };
  const k = (box.x1 - box.x0) / (cellBox.x1 - cellBox.x0);
  const toFrame = (p: readonly [number, number]) =>
    [box.x0 + (p[0] - cellBox.x0) * k, box.y0 + (p[1] - cellBox.y0) * k] as const;
  const extremes = CHANNELS.map((c) => {
    const at = drawn.reduce(
      (best, i) =>
        [best, i][
          Number(Math.abs(c.from(poses[i] ?? RIG_REST)) > Math.abs(c.from(poses[best] ?? RIG_REST)))
        ] ?? best,
      first,
    );
    return { ...c, at, value: c.from(poses[at] ?? RIG_REST) };
  });
  const all = allAtOnce(drawn.map((i) => poses[i] ?? RIG_REST));
  const shots = [
    ...extremes.map((e) => ({
      name: e.name,
      part: e.part,
      at: e.at,
      pose: poses[e.at] ?? RIG_REST,
    })),
    { name: 'all', part: 'body' satisfies RigPart, at: first, pose: all },
  ];
  const JOINT = 80;
  const holes = [];
  for (const s of shots) {
    const png = yield* rigged(posedReq(s.at, s.pose, 'colour'));
    yield* fs.writeFile(path.join(dirs.stills, `extreme-${s.name}.png`), png);
    const alone = yield* rasterOf(yield* rigged(posedReq(s.at, s.pose, `figure:${PROTO.figure}`)));
    const rest = yield* rasterOf(yield* rigged(posedReq(s.at, RIG_REST, `figure:${PROTO.figure}`)));
    holes.push({ still: `extreme-${s.name}.png`, frame: s.at, ...holeCounts(rest, alone) });
    const joints = RIG_PARTS.filter((p) => p !== 'body' && p !== 'armRight').filter(
      (p) => s.name === 'all' || p === s.part,
    );
    for (const part of joints) {
      const [x, y] = toFrame(sheet.pivots[part]);
      const left = Math.max(0, Math.round(x - JOINT));
      const top = Math.max(0, Math.round(y - JOINT));
      yield* Effect.tryPromise({
        try: () =>
          sharp(png)
            .extract({ left, top, width: JOINT * 2, height: JOINT * 2 })
            .png()
            .toFile(
              path.join(
                dirs.stills,
                `joint-${part}-${[String(s.at), 'all'][Number(s.name === 'all')]}.png`,
              ),
            ),
        catch: (e) => StorybookFailed.make({ reason: `crop ${part}: ${String(e)}` }),
      });
    }
  }
  const stressFrame = times.findIndex((t) => t >= clock.stress - 1e-6);
  const channels = {
    fps: shot.fps,
    stress: stressFrame,
    drawn: [first, drawn.at(-1) ?? first],
    clock,
    parts: Object.fromEntries(
      RIG_PARTS.map((part) => [
        part,
        {
          parent: PARENTS[part],
          pivot: sheet.pivots[part],
          angle: poses.map((p) => p[part].angle),
          scale: poses.map((p) => p[part].sy),
          dx: poses.map((p) => p[part].dx),
          dy: poses.map((p) => p[part].dy),
        },
      ]),
    ),
  };
  yield* fs.writeFileString(path.join(out, 'channels.json'), `${jsonOf(channels)}\n`);
  yield* fs.writeFileString(
    path.join(out, 'holes.json'),
    `${jsonOf({ extremes: extremes.map(({ from: _, ...e }) => e), holes, mapping: { box, k } })}\n`,
  );
  const voice = placed.scene.voice.file ?? '';
  const audio = path.join(path.dirname(story.timings), voice);
  const offset = start - placed.scene.speechStart;
  yield* Console.log(
    `rig: sound ${voice} from ${offset.toFixed(3)} s; stress at frame ${stressFrame}`,
  );
  for (const name of ['today', 'rig'] as const) {
    const silent = path.join(scratch, `${name}.mp4`);
    yield* encodeClip(dirs[name], shot.fps, silent);
    yield* ffmpeg([
      '-i',
      silent,
      '-ss',
      offset.toFixed(3),
      '-t',
      String(PROTO.seconds),
      '-i',
      audio,
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      path.join(dirs.clips, `${name}.mp4`),
    ]);
  }
  const labels = path.join(scratch, 'labels');
  yield* fs.makeDirectory(labels, { recursive: true });
  for (const name of ['today', 'rig'] as const)
    yield* fs.writeFile(path.join(labels, `${name}.png`), yield* labelPng(name));
  yield* ffmpeg([
    '-i',
    path.join(dirs.clips, 'today.mp4'),
    '-i',
    path.join(dirs.clips, 'rig.mp4'),
    '-i',
    path.join(labels, 'today.png'),
    '-i',
    path.join(labels, 'rig.png'),
    '-filter_complex',
    '[0:v][2:v]overlay=24:24[a];[1:v][3:v]overlay=24:24[b];[a][b]hstack=inputs=2[v]',
    '-map',
    '[v]',
    '-map',
    '0:a',
    '-c:v',
    'libx264',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'copy',
    path.join(dirs.clips, 'side-by-side.mp4'),
  ]);
  yield* Console.log(`rig: wrote ${out}`);
});

// oxlint-disable-next-line effect/noGlobals -- the prototype's command line: the unit dir it writes and the scratch dir for its frames
const [out = '', scratch = `${APP}/out/scratch/rig/proto`] = process.argv.slice(2);

run(out, scratch).pipe(
  Effect.scoped,
  Effect.provide(filmFolder.pipe(Layer.provideMerge(BunServices.layer))),
  BunRuntime.runMain,
);
