// The reader lock: `reader.lock.json`, the record of the reader the cast
// build trained, written by the build's last stage from its inputs' outputs
// (`lockStage`). It names the reader's key on the volume, the train stage's
// key, the training set (its hash and each drawing's shard), the train
// config, the checkpoint's SHA-256, the train's fit summary and spend as the
// train noted them in `build.json` (absent for a train that noted none),
// each trained drawing's held numbers, each untrained drawing's, and the
// clip's chain numbers. The stage's output is the file's bytes; a cached one
// holds only while the file on disk has them, so a rerun with nothing
// changed writes nothing, and a file edited or lost is written again.

import { Effect, FileSystem, Option, Schema } from 'effect';
import { sha256Hex } from '../digest.ts';
import {
  type BuiltRecord,
  type Stage,
  StageFailed,
  fileInput,
  optionalInput,
  stageInput,
} from './graph.ts';
import { type Candidate, FitNote, TRAIN, trainKeyOf } from './stages.ts';

/** A spread of the median and the 90th percentile. */
const Spread = Schema.Struct({ median: Schema.Finite, p90: Schema.Finite });
/** A spread as the lock keeps it: eval.py's also carries its count and mean. */
const spreadOf = (s: typeof Spread.Type) => ({ median: s.median, p90: s.p90 });

/** The part of an eval's output (eval.py's JSON) the lock reads: the trained drawing's held samples, or the untrained one's. */
const EvalJson = Schema.fromJsonString(
  Schema.Struct({
    seen: Schema.optionalKey(
      Schema.Struct({
        n: Schema.Finite,
        accuracy: Schema.Finite,
        angle_deg: Spread,
        joint_px: Spread,
      }),
    ),
    unseen: Schema.optionalKey(
      Schema.Struct({ n: Schema.Finite, angle_deg: Spread, joint_px: Spread }),
    ),
  }),
);

/** The part of a clip's chain (`chain.ts`) the lock reads: its IoU and named drawings per band, and its runs. */
const ChainNumbers = Schema.Struct({
  iou: Schema.Record(Schema.String, Schema.Finite),
  named: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Finite)),
  runs: Schema.Array(
    Schema.Struct({ from: Schema.Finite, to: Schema.Finite, drawing: Schema.String }),
  ),
});
const ChainJson = Schema.fromJsonString(ChainNumbers);

const Lock = Schema.Struct({
  reader: Schema.String,
  stageKey: Schema.String,
  trainset: Schema.String,
  drawings: Schema.Record(Schema.String, Schema.String),
  config: Schema.Struct({
    steps: Schema.Finite,
    batch: Schema.Finite,
    lr: Schema.Finite,
    seed: Schema.Finite,
    gpu: Schema.String,
    precision: Schema.String,
    backbone: Schema.String,
    inputSide: Schema.Struct({ width: Schema.Finite, height: Schema.Finite }),
  }),
  checkpointSha256: Schema.String,
  train: Schema.Struct({
    trainedOn: Schema.optionalKey(Schema.String),
    modalApp: Schema.optionalKey(Schema.String),
    steps: Schema.optionalKey(Schema.Finite),
    secPerStep: Schema.optionalKey(Schema.Finite),
    trainSec: Schema.optionalKey(Schema.Finite),
    finalLoss: Schema.optionalKey(Schema.Finite),
    stageSec: Schema.Finite,
  }),
  held: Schema.Struct({
    drawings: Schema.Finite,
    accuracy: Schema.Finite,
    byDrawing: Schema.Record(
      Schema.String,
      Schema.Struct({
        n: Schema.Finite,
        accuracy: Schema.Finite,
        angleDeg: Spread,
        jointPx: Spread,
      }),
    ),
  }),
  untrained: Schema.Record(
    Schema.String,
    Schema.Struct({ n: Schema.Finite, angleDeg: Spread, jointPx: Spread }),
  ),
  clip: Schema.optionalKey(
    Schema.Struct({ member: Schema.String, clip: Schema.String, ...ChainNumbers.fields }),
  ),
  spend: Schema.optionalKey(Schema.Struct({ buildCountedUsd: Schema.Finite })),
});
const LockJson = Schema.fromJsonString(Lock, { space: 2 });

const encoder = new TextEncoder();

/** A clip the lock reports: its member and its id (`raise/clip-b`); its stage is `eval:clip:<clip>@<member>`. */
interface LockClip {
  readonly member: string;
  readonly clip: string;
}

const failed = (what: string) => (e: { readonly message: string }) =>
  StageFailed.make({ reason: `lock ${what}: ${e.message}` });

/** The train's lines of the lock: the fit summary it noted, if any, and the stage's wall time. */
const trainOf = (train: BuiltRecord) =>
  Effect.gen(function* () {
    const stageSec = Math.round(train.ms / 1000);
    if (Option.isNone(train.note)) return { stageSec };
    const fit = yield* Schema.decodeEffect(FitNote)(train.note.value);
    return {
      trainedOn: fit.trainedOn,
      ...Option.match(Option.fromUndefinedOr(fit.modalApp), {
        onNone: () => ({}),
        onSome: (modalApp) => ({ modalApp }),
      }),
      steps: fit.steps,
      secPerStep: fit.secPerStep,
      trainSec: Math.round(fit.steps * fit.secPerStep),
      finalLoss: fit.finalLoss,
      stageSec,
    };
  });

/**
 * The lock stage: after the train, every candidate's eval and `clip`'s
 * chain, it writes `file` from their outputs. A trained drawing's eval is
 * required (the lock never names a trained drawing without its held
 * numbers); an untrained one's joins when it has an output. `sources` are
 * the reader's files, which the reader's key reads.
 */
export const lockStage = (o: {
  readonly file: string;
  readonly candidates: ReadonlyArray<Candidate>;
  readonly sources: ReadonlyArray<string>;
  readonly clip: Option.Option<LockClip>;
}): Stage<FileSystem.FileSystem> => {
  const evalOf = (c: Candidate) => c.renders.replace(/^renders:/, 'eval:');
  const clipId = Option.map(o.clip, (c) => `eval:clip:${c.clip}@${c.member}`);
  return {
    id: 'lock',
    inputs: [
      stageInput('trainset'),
      stageInput('train'),
      ...o.sources.map(fileInput),
      ...o.candidates.map((c) => optionalInput(evalOf(c))),
      ...Option.match(clipId, { onNone: () => [], onSome: (id) => [stageInput(id)] }),
    ],
    version: '1',
    run: (ctx) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { set, trainset, key } = yield* trainKeyOf(ctx, o.sources);
        const train = yield* ctx.built('train');
        const drawings = new TextDecoder()
          .decode(set)
          .split('\n')
          .filter((line) => line.length > 0)
          .map((line) => {
            const at = line.lastIndexOf('=');
            return [line.slice(0, at), line.slice(at + 1)] as const;
          });
        const inSet = new Set(drawings.map(([d]) => d));
        const byDrawing = new Map(o.candidates.map((c) => [c.drawing, c]));
        const evalNumbers = (c: Candidate) =>
          Effect.flatMap(ctx.output(evalOf(c)), (bytes) =>
            Schema.decodeEffect(EvalJson)(new TextDecoder().decode(bytes)),
          ).pipe(Effect.mapError(failed(evalOf(c))));

        const held: Array<readonly [string, (typeof Lock.Type.held.byDrawing)[string]]> = [];
        for (const [drawing] of drawings) {
          const c = Option.filter(Option.fromUndefinedOr(byDrawing.get(drawing)), (one) =>
            ctx.known(evalOf(one)),
          );
          if (Option.isNone(c))
            return yield* StageFailed.make({ reason: `lock: no held eval for ${drawing}` });
          const seen = Option.fromUndefinedOr((yield* evalNumbers(c.value)).seen);
          if (Option.isNone(seen))
            return yield* StageFailed.make({
              reason: `lock: ${evalOf(c.value)} has no held samples`,
            });
          const s = seen.value;
          held.push([
            drawing,
            {
              n: s.n,
              accuracy: s.accuracy,
              angleDeg: spreadOf(s.angle_deg),
              jointPx: spreadOf(s.joint_px),
            },
          ]);
        }
        const untrained: Array<readonly [string, (typeof Lock.Type.untrained)[string]]> = [];
        for (const c of o.candidates) {
          if (inSet.has(c.drawing) || !ctx.known(evalOf(c))) continue;
          const unseen = Option.fromUndefinedOr((yield* evalNumbers(c)).unseen);
          if (Option.isNone(unseen)) continue;
          const u = unseen.value;
          untrained.push([
            c.drawing,
            { n: u.n, angleDeg: spreadOf(u.angle_deg), jointPx: spreadOf(u.joint_px) },
          ]);
        }
        const clip = yield* Option.match(
          Option.zipWith(o.clip, clipId, (c, id) => [c, id] as const),
          {
            onNone: () => Effect.succeed({}),
            onSome: ([c, id]) =>
              ctx.output(id).pipe(
                Effect.flatMap((bytes) =>
                  Schema.decodeEffect(ChainJson)(new TextDecoder().decode(bytes)),
                ),
                Effect.map((chain) => ({
                  clip: {
                    member: c.member,
                    clip: c.clip,
                    iou: chain.iou,
                    named: chain.named,
                    runs: chain.runs,
                  },
                })),
                Effect.mapError(failed(id)),
              ),
          },
        );
        const hits = held.filter(([, h]) => h.accuracy === 1).length;
        const text = yield* Schema.encodeEffect(LockJson)({
          reader: key,
          stageKey: train.key,
          trainset,
          drawings: Object.fromEntries(drawings),
          config: TRAIN,
          checkpointSha256: train.output,
          train: yield* trainOf(train).pipe(Effect.mapError(failed('train note'))),
          held: {
            drawings: drawings.length,
            accuracy: hits / Math.max(1, drawings.length),
            byDrawing: Object.fromEntries(held),
          },
          untrained: Object.fromEntries(untrained),
          ...clip,
          ...Option.match(train.usd, {
            onNone: () => ({}),
            onSome: (buildCountedUsd) => ({ spend: { buildCountedUsd } }),
          }),
        }).pipe(Effect.mapError(failed('encode')));
        const bytes = encoder.encode(`${text}\n`);
        const there = yield* fs.readFile(o.file).pipe(Effect.option);
        if (!Option.exists(there, (b) => sha256Hex(b) === sha256Hex(bytes)))
          yield* fs.writeFile(o.file, bytes).pipe(Effect.mapError(failed(o.file)));
        return bytes;
      }),
    holds: (output) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const there = yield* fs.readFile(o.file).pipe(Effect.option);
        return Option.exists(there, (b) => sha256Hex(b) === sha256Hex(output));
      }),
  };
};
