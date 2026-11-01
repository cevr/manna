// The reader lock: `reader.lock.json`, the record of the reader the cast
// build trained, written by the build's last stage from its inputs' outputs
// (`lockStage`). It names the reader's key on the volume, the train stage's
// key, the train files the reader's key hashed (`trainer`), the training set (its hash and each drawing's shard), the train
// config, the checkpoint's SHA-256, the train's fit summary and spend as the
// train noted them in `build.json` (absent for a train that noted none; a
// train that adopted the committed checkpoint notes the lock's own, kept),
// each trained drawing's held numbers, each untrained drawing's, and every
// clip's entry with its verdict (`clips.ts` `ClipLock`) and how many passed;
// a failing clip is written all the same, and the build then fails with
// `ClipsFailed` (`checkClips`). The stage's output is the file's bytes; a cached one
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
import { ClipLock } from './clips.ts';
import {
  AdoptedNote,
  BuildSpend,
  type Candidate,
  EvalJson,
  FitNote,
  HeldLine,
  Spread,
  TRAIN,
  TrainLines,
  trainKeyOf,
} from './stages.ts';

/** A spread as the lock keeps it: eval.py's also carries its count and mean. */
const spreadOf = (s: typeof Spread.Type) => ({ median: s.median, p90: s.p90 });

/** An eval:clip stage's output: the clip's lock entry (`clips.ts` `clipEntryOf`). */
const ClipLockJson = Schema.fromJsonString(ClipLock);

/** Every clip the build judges: how many passed, how many there are, and each judged one's entry by `<member>/<clip>`. */
const Clips = Schema.Struct({
  passed: Schema.Int,
  of: Schema.Int,
  byClip: Schema.Record(Schema.String, ClipLock),
});

const Lock = Schema.Struct({
  reader: Schema.String,
  stageKey: Schema.String,
  /** The reader's train files by basename, each file's SHA-256: what `reader` keys beside the set and the config. */
  trainer: Schema.Record(Schema.String, Schema.String),
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
  train: TrainLines,
  held: Schema.Struct({
    drawings: Schema.Finite,
    accuracy: Schema.Finite,
    byDrawing: Schema.Record(Schema.String, HeldLine),
  }),
  untrained: Schema.Record(
    Schema.String,
    Schema.Struct({ n: Schema.Finite, angleDeg: Spread, jointPx: Spread }),
  ),
  clips: Clips,
  spend: Schema.optionalKey(BuildSpend),
});
const LockJson = Schema.fromJsonString(Lock, { space: 2 });

const encoder = new TextEncoder();

/** A clip the lock reports: its member and its id (`raise/clip-b`); its stage is `eval:clip:<clip>@<member>`. */
export interface LockClip {
  readonly member: string;
  readonly clip: string;
}

const clipStageOf = (c: LockClip) => `eval:clip:${c.clip}@${c.member}`;
const clipKeyOf = (c: LockClip) => `${c.member}/${c.clip}`;

/** The part of a lock `failedClipsOf` reads. */
const ClipsJson = Schema.fromJsonString(Schema.Struct({ clips: Clips }));

/**
 * Each of `clips` the lock (its text) does not pass, as `<member>/<clip>:`
 * and its failed bars, or `no eval` when the lock has no entry for it.
 */
export const failedClipsOf = (text: string, clips: ReadonlyArray<LockClip>) =>
  Effect.map(Schema.decodeEffect(ClipsJson)(text), ({ clips: { byClip } }) =>
    clips.flatMap((c) => {
      const key = clipKeyOf(c);
      return Option.match(Option.fromUndefinedOr(byClip[key]), {
        onNone: () => [`${key}: no eval`],
        onSome: (entry) =>
          Option.toArray(Option.liftPredicate(entry, (e) => !e.pass)).map(
            (e) => `${key}: ${e.fails.join('; ')}`,
          ),
      });
    }),
  );

/** A build whose lock does not pass every clip: each one as `failedClipsOf` names it. */
export class ClipsFailed extends Schema.TaggedError<ClipsFailed>()('ClipsFailed', {
  clips: Schema.Array(Schema.String),
}) {
  override get message() {
    return `clips failed: ${this.clips.join('; ')}`;
  }
}

/** After a build: the lock at `file` passes each of `clips`, else `ClipsFailed` names every one it does not. */
export const checkClips = Effect.fn('film.cast.checkClips')(function* (
  file: string,
  clips: ReadonlyArray<LockClip>,
) {
  const fs = yield* FileSystem.FileSystem;
  const failing = yield* failedClipsOf(yield* fs.readFileString(file), clips);
  if (failing.length > 0) return yield* ClipsFailed.make({ clips: failing });
});

const failed = (what: string) => (e: { readonly message: string }) =>
  StageFailed.make({ reason: `lock ${what}: ${e.message}` });

/** A train that adopted the committed checkpoint: the lock's train lines and spend it noted, kept as they are. */
const adoptedOf = (train: BuiltRecord) =>
  Option.flatMap(train.note, (note) =>
    Option.map(Schema.decodeOption(AdoptedNote)(note), (n) => n.adopted),
  );

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
 * The lock stage: after the train, every candidate's eval and each clip's
 * eval, it writes `file` from their outputs. A trained drawing's eval is
 * required (the lock never names a trained drawing without its held
 * numbers); an untrained one's joins when it has an output. Every clip
 * counts in `clips.of`; a clip whose eval has an output carries its entry,
 * pass or fail, and one with none (its stage failed) is left unpassed, so
 * the lock is written whatever the clips. `trainFiles` are the reader's
 * train files (`CastReader.sources.train`), which the reader's key reads and
 * `trainer` names by their hashes.
 */
export const lockStage = (o: {
  readonly file: string;
  readonly candidates: ReadonlyArray<Candidate>;
  readonly trainFiles: ReadonlyArray<string>;
  readonly clips: ReadonlyArray<LockClip>;
}): Stage<FileSystem.FileSystem> => {
  const evalOf = (c: Candidate) => c.renders.replace(/^renders:/, 'eval:');
  return {
    id: 'lock',
    inputs: [
      stageInput('trainset'),
      stageInput('train'),
      ...o.trainFiles.map(fileInput),
      ...o.candidates.map((c) => optionalInput(evalOf(c))),
      ...o.clips.map((c) => optionalInput(clipStageOf(c))),
    ],
    version: '1',
    run: (ctx) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { set, trainset, trainer, key } = yield* trainKeyOf(ctx, o.trainFiles);
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
          const seen = Option.fromNullishOr((yield* evalNumbers(c.value)).seen);
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
          const unseen = Option.fromNullishOr((yield* evalNumbers(c)).unseen);
          if (Option.isNone(unseen)) continue;
          const u = unseen.value;
          untrained.push([
            c.drawing,
            { n: u.n, angleDeg: spreadOf(u.angle_deg), jointPx: spreadOf(u.joint_px) },
          ]);
        }
        const judged = yield* Effect.forEach(
          o.clips.filter((c) => ctx.known(clipStageOf(c))),
          (c) =>
            ctx.output(clipStageOf(c)).pipe(
              Effect.flatMap((bytes) =>
                Schema.decodeEffect(ClipLockJson)(new TextDecoder().decode(bytes)),
              ),
              Effect.map((entry) => [clipKeyOf(c), entry] as const),
              Effect.mapError(failed(clipStageOf(c))),
            ),
        );
        const clips = {
          passed: judged.filter(([, entry]) => entry.pass).length,
          of: o.clips.length,
          byClip: Object.fromEntries(judged),
        };
        const hits = held.filter(([, h]) => h.accuracy === 1).length;
        const adopted = adoptedOf(train);
        const spend = Option.match(adopted, {
          onSome: (a) => Option.fromUndefinedOr(a.spend),
          onNone: () => Option.map(train.usd, (buildCountedUsd) => ({ buildCountedUsd })),
        });
        const text = yield* Schema.encodeEffect(LockJson)({
          reader: key,
          stageKey: train.key,
          trainer,
          trainset,
          drawings: Object.fromEntries(drawings),
          config: TRAIN,
          checkpointSha256: train.output,
          train: yield* Option.match(adopted, {
            onSome: (a) => Effect.succeed(a.train),
            onNone: () => trainOf(train).pipe(Effect.mapError(failed('train note'))),
          }),
          held: {
            drawings: drawings.length,
            accuracy: hits / Math.max(1, drawings.length),
            byDrawing: Object.fromEntries(held),
          },
          untrained: Object.fromEntries(untrained),
          clips,
          ...Option.match(spend, { onNone: () => ({}), onSome: (s) => ({ spend: s }) }),
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
