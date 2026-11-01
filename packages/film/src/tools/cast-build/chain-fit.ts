// One route A fit of the clip chain (`chain.ts`), in its own process:
//
//   bun chain-fit.ts <job.v8> <out.json>
//
// The job (a `FitJob`, v8-serialized) names the puppet, the canvas frame,
// the start pose, the bones and the paper; `fitPose` fits every named
// bone, the root and the scale, and the fit is written as JSON with its
// loss, its raster count and its seconds.

import { deserialize } from 'node:v8';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import { Clock, Effect, FileSystem, Schema } from 'effect';
import { fitPose } from '../../core/pose-fit.ts';
import { type FitJob, FitResultJson } from './chain.ts';

const chainFit = Command.make(
  'chain-fit',
  {
    job: Argument.String('job').pipe(Argument.withDescription('the FitJob, v8-serialized')),
    out: Argument.String('out').pipe(Argument.withDescription('the fit JSON to write')),
  },
  Effect.fn('cast.chain.fit')(function* (input) {
    const fs = yield* FileSystem.FileSystem;
    const job: FitJob = deserialize(yield* fs.readFile(input.job));
    const t0 = yield* Clock.currentTimeMillis;
    const fit = fitPose(job.puppet, job.target, {
      bones: job.bones,
      start: job.start,
      paper: job.paper,
    });
    const sec = ((yield* Clock.currentTimeMillis) - t0) / 1000;
    yield* fs.writeFileString(
      input.out,
      yield* Schema.encodeEffect(FitResultJson)({
        numbers: fit.numbers,
        root: fit.root,
        scale: fit.scale,
        loss: fit.loss,
        rasters: fit.rasters,
        sec,
      }),
    );
  }),
);

if (import.meta.main)
  Command.run(chainFit, { version: '0' }).pipe(
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
