#!/usr/bin/env bun

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Layer, Stdio } from 'effect';
import { FetchHttpClient } from 'effect/http';

import { lintJudged } from './judged/cli.js';
import { judgedModel } from './judged/model.js';

Stdio.Stdio.use(({ args }) =>
  Effect.flatMap(args, (argv) =>
    lintJudged(argv, '.', (model) => judgedModel(model).pipe(Layer.provide(FetchHttpClient.layer))),
  ),
).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
