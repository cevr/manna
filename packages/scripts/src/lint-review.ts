#!/usr/bin/env bun

import * as BunCrypto from '@effect/platform-bun/BunCrypto';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Stdio } from 'effect';

import { lintReview } from './judged/cli.js';

Stdio.Stdio.use(({ args }) => Effect.flatMap(args, (argv) => lintReview(argv, '.'))).pipe(
  Effect.provide([BunServices.layer, BunCrypto.layerDigest]),
  BunRuntime.runMain,
);
