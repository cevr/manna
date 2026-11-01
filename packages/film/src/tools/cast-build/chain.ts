// The clip chain (`film concept reader chain`, the `eval:clip:<clip>`
// stage): a clip read by the cast reader, posed frame by frame with the
// member's puppets, and scored against the clip's own figure.
//
// - **Cut.** Each frame names the member's drawing the classifier finds most
//   likely; a run is a stretch of frames naming one drawing.
// - **World.** Each run's bone angles, read against its drawing's rest, are
//   gated (while a bone's end joint has confidence under 0.1, its last good
//   angle holds), then smoothed by a causal One Euro filter (0.1 Hz, beta
//   0.3) on unwrapped degrees.
// - **Seed.** A frame's pose: each bone's number from the world angles, top
//   down; the root and scale by least squares of the puppet's joints on the
//   read's (confidence over 0.5).
// - **Route A.** On every 16th frame of a run and its last, `fitPose`
//   (`core/pose-fit.ts`) fits every bone, the root and the scale to the
//   frame, from the seed of the run's raw read; each fit runs in its own
//   process (`chain-fit.ts`) and is cached by the hash of what it reads.
//   The correction (fit less seed) is carried linearly between a run's keys.
// - **Score.** The IoU of the posed puppet's alpha (over 127) with the
//   clip's figure: on the mapped canvas frame, the paper is the mean of the
//   four corners, and a pixel is figure where its RGB distance (L1) to the
//   paper is over 24.

import { availableParallelism } from 'node:os';
import { serialize } from 'node:v8';
import { Clock, Duration, Effect, FileSystem, Path, Result, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { jointsOf } from '../../core/pose-sample.ts';
import { type Puppet, type PuppetPose, rasterOf } from '../../core/puppet.ts';
import type { Raster } from '../../core/raster.ts';
import { sha256Hex } from '../digest.ts';
import { decodePng } from '../png.ts';
import { collectWithin } from '../process.ts';
import {
  Angles,
  type Band,
  CHAIN,
  type ChainFrame,
  type ClipRead,
  type Correction,
  END,
  type Run,
  bandsOf,
  carried,
  cutOf,
  figureOf,
  gate,
  iouOf,
  keysOf,
  oneEuro,
  paperOf,
  wrap,
} from './chain-steps.ts';

/** Each frame's world angles: its run's drawing's, gated, then One Euro over the run. */
const worldsOf = (read: ClipRead, runs: ReadonlyArray<Run>) => {
  const out: Array<Record<string, number>> = read.frames.map(() => ({}));
  for (const { from, to, drawing } of runs) {
    const frames = read.frames.slice(from, to);
    for (const bone of Object.keys(frames[0]?.worlds[drawing] ?? {})) {
      const x = frames.map((fr) => fr.worlds[drawing]?.[bone] ?? 0);
      const end = END.get(bone);
      const conf = frames.map((fr) => (end === undefined ? 1 : (fr.joints[end]?.[2] ?? 0)));
      oneEuro(gate(x, conf, CHAIN.gate)).forEach((v, i) => (out[from + i]![bone] = v));
    }
  }
  return out;
};

/**
 * The seed pose of `p` from world angles and the read's joints: each bone's
 * number its world angle less its parent's (0 for a bone the read lacks);
 * root and scale by least squares of the puppet's joints at that pose on
 * the read's joints with confidence over `confidence`.
 */
const seedOf = (
  p: Puppet,
  world: Readonly<Record<string, number>>,
  joints: Readonly<Record<string, readonly [number, number, number]>>,
  confidence: number = CHAIN.seedConfidence,
): PuppetPose => {
  const numbers: Record<string, number> = {};
  const w: Record<string, number> = {};
  for (const b of p.bones) {
    const up = b.parent ? w[b.parent]! : 0;
    numbers[b.name] = b.name in world ? world[b.name]! - up : 0;
    w[b.name] = numbers[b.name]! + up;
  }
  const at = jointsOf(p, { numbers, root: p.root, scale: 1 });
  const used = Object.keys(at).filter((j) => (joints[j]?.[2] ?? 0) > confidence);
  const D = used.map((j) => [at[j]![0] - p.root[0], at[j]![1] - p.root[1]] as const);
  const R = used.map((j) => joints[j]!);
  const mean = (a: ReadonlyArray<readonly number[]>, c: number) =>
    a.reduce((s, v) => s + v[c]!, 0) / a.length;
  const [dx, dy, rx, ry] = [mean(D, 0), mean(D, 1), mean(R, 0), mean(R, 1)];
  let num = 0;
  let den = 0;
  for (let i = 0; i < used.length; i++) {
    num += (R[i]![0] - rx) * (D[i]![0] - dx) + (R[i]![1] - ry) * (D[i]![1] - dy);
    den += (D[i]![0] - dx) ** 2 + (D[i]![1] - dy) ** 2;
  }
  const scale = num / den;
  return { numbers, root: [rx - scale * dx, ry - scale * dy], scale };
};

const correctionOf = (seed: PuppetPose, fit: PuppetPose): Correction => ({
  numbers: Object.fromEntries(
    Object.entries(fit.numbers).map(([b, v]) => [b, wrap(v - (seed.numbers[b] ?? 0))]),
  ),
  root: [fit.root[0] - seed.root[0], fit.root[1] - seed.root[1]],
  scale: fit.scale - seed.scale,
});

/** `seed` moved by `c`. */
const corrected = (seed: PuppetPose, c: Correction): PuppetPose => ({
  numbers: Object.fromEntries(
    Object.entries(seed.numbers).map(([k, v]) => [k, v + (c.numbers[k] ?? 0)]),
  ),
  root: [seed.root[0] + c.root[0], seed.root[1] + c.root[1]],
  scale: seed.scale + c.scale,
});

// ---------- the run: fits in parallel processes, cached; then every frame posed and scored

/** One route A fit, as `chain-fit.ts` reads it: the puppet, the frame, the start, the bones and the paper. */
export interface FitJob {
  readonly puppet: Puppet;
  readonly target: Raster;
  readonly start: PuppetPose;
  readonly bones: ReadonlyArray<string>;
  readonly paper: readonly [number, number, number];
}

const FitResult = Schema.Struct({
  numbers: Angles,
  root: Schema.Tuple([Schema.Finite, Schema.Finite]),
  scale: Schema.Finite,
  loss: Schema.Finite,
  rasters: Schema.Finite,
  sec: Schema.Finite,
});
interface FitResult extends Schema.Schema.Type<typeof FitResult> {}
export const FitResultJson = Schema.fromJsonString(FitResult);

/** The files a fit's output is made by: the fit's own process and the puppet's raster. */
const FIT_SOURCES = [
  'chain-fit.ts',
  '../../core/pose-fit.ts',
  '../../core/puppet.ts',
  '../../core/affine.ts',
  '../../core/raster.ts',
];
const FIT_LIMIT = Duration.hours(1);

export class ChainFailed extends Schema.TaggedError<ChainFailed>()('ChainFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return `clip chain: ${this.reason}`;
  }
}

/** A mapped canvas PNG read. */
const canvasAt = Effect.fn('cast.chain.canvas')(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  const decoded = decodePng(yield* fs.readFile(file));
  if (Result.isFailure(decoded))
    return yield* ChainFailed.make({ reason: `${file}: ${String(decoded.failure)}` });
  return decoded.success;
});

/** What a chain reads: the clip's read, its mapped canvas frames, each drawing's puppet, the fit cache and the bands to report. */
interface ChainInput<R = never> {
  readonly read: ClipRead;
  readonly canvas: string;
  readonly member: string;
  readonly puppetOf: (drawing: string) => Effect.Effect<Puppet, ChainFailed, R>;
  readonly cache: string;
  readonly bands: ReadonlyArray<Band>;
}

/**
 * Route A on each job, each in its own `bun chain-fit.ts` process, as many
 * at once as the host has cores; a fit whose key (the hash of its job and
 * of the files that make it) is in `<cache>/fits/` is read, not run.
 */
const fitAll = Effect.fn('cast.chain.fitAll')(function* (
  jobs: ReadonlyArray<FitJob>,
  cache: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const sources = yield* Effect.forEach(FIT_SOURCES, (s) =>
    fs.readFile(path.join(import.meta.dir, s)),
  );
  const made = sha256Hex(sources.map((b) => sha256Hex(b)).join('\n'));
  const dir = path.join(cache, 'fits');
  yield* fs.makeDirectory(dir, { recursive: true });
  const script = path.join(import.meta.dir, 'chain-fit.ts');
  return yield* Effect.forEach(
    jobs,
    (job) =>
      Effect.gen(function* () {
        const bytes = serialize(job);
        const key = sha256Hex(`${made}\n${sha256Hex(bytes)}`);
        const out = path.join(dir, `${key}.json`);
        if (yield* fs.exists(out)) {
          const fit = yield* Schema.decodeEffect(FitResultJson)(yield* fs.readFileString(out));
          return { fit, cached: true };
        }
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const scratch = yield* fs.makeTempDirectoryScoped();
            const jobFile = path.join(scratch, 'job.v8');
            const partial = path.join(scratch, 'fit.json');
            yield* fs.writeFile(jobFile, bytes);
            const ran = yield* collectWithin(
              spawner,
              'chain-fit',
              ChildProcess.make(process.execPath, [script, jobFile, partial], {
                forceKillAfter: Duration.seconds(5),
              }),
              FIT_LIMIT,
            );
            if (ran.exitCode !== 0)
              return yield* ChainFailed.make({
                reason: `a fit exited ${ran.exitCode}: ${ran.stderr.trim().split('\n').slice(-4).join('\n')}`,
              });
            const text = yield* fs.readFileString(partial);
            const fit = yield* Schema.decodeEffect(FitResultJson)(text);
            yield* fs.writeFileString(`${out}.partial`, text);
            yield* fs.rename(`${out}.partial`, out);
            return { fit, cached: false };
          }),
        );
      }),
    { concurrency: Math.max(1, availableParallelism()) },
  );
});

/** The chain on a read clip: its runs and keys, each frame's drawing and IoU, each band's mean and counts. */
export const chainOf = Effect.fn('cast.chain.of')(function* <R>(input: ChainInput<R>) {
  const path = yield* Path.Path;
  const t0 = yield* Clock.currentTimeMillis;
  const { read } = input;
  const { named, runs } = cutOf(read, input.member);
  if (runs.length === 0 || named.some((n) => n.drawing === ''))
    return yield* ChainFailed.make({ reason: `the reader knows no drawing of ${input.member}` });
  const worlds = worldsOf(read, runs);
  const keys = keysOf(runs);
  const puppets = new Map<string, Puppet>();
  for (const { drawing } of runs)
    if (!puppets.has(drawing)) puppets.set(drawing, yield* input.puppetOf(drawing));
  const canvases = yield* Effect.forEach(read.frames, (fr) =>
    canvasAt(path.join(input.canvas, `${fr.id}.png`)),
  );
  const drawingAt = (f: number) => named[f]!.drawing;
  const jobs = keys.map((f): FitJob => {
    const puppet = puppets.get(drawingAt(f))!;
    const fr = read.frames[f]!;
    return {
      puppet,
      target: canvases[f]!,
      start: seedOf(puppet, fr.worlds[drawingAt(f)] ?? {}, fr.joints),
      bones: puppet.bones.map((b) => b.name),
      paper: paperOf(canvases[f]!),
    };
  });
  const t1 = yield* Clock.currentTimeMillis;
  const fits = yield* fitAll(jobs, input.cache);
  const fitMs = (yield* Clock.currentTimeMillis) - t1;
  const corrections = new Map(
    keys.map((f, i) => [f, correctionOf(jobs[i]!.start, fits[i]!.fit)] as const),
  );
  const along = carried(runs, keys, corrections);
  const frames = read.frames.map((fr, f): ChainFrame => {
    const puppet = puppets.get(drawingAt(f))!;
    const pose = corrected(seedOf(puppet, worlds[f]!, fr.joints), along[f]!);
    const drawn = rasterOf(puppet, pose, [canvases[f]!.width, canvases[f]!.height]);
    return { f, drawing: drawingAt(f), p: named[f]!.p, iou: iouOf(figureOf(canvases[f]!), drawn) };
  });
  const all: Band = [0, frames.length - 1];
  const bands = [all, ...input.bands.filter(([a, b]) => a !== all[0] || b !== all[1])];
  return {
    runs,
    keys,
    frames,
    ...bandsOf(frames, bands),
    fits: {
      run: fits.filter((x) => !x.cached).length,
      cached: fits.filter((x) => x.cached).length,
      ms: Math.round(fitMs),
      sec: fits.reduce((s, x) => s + x.fit.sec, 0),
    },
    ms: Math.round((yield* Clock.currentTimeMillis) - t0),
  };
});
