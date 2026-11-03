/**
 * The probe's sim script, as an app's own is: `launch` at a place of the
 * probe app, its state in `--state`. The slow test runs it as a process.
 */
import { Effect, Path } from 'effect';

import { launch } from '../index.ts';
import { probeApp } from './probe.ts';

launch(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const script = yield* path.fromFileUrl(new URL(import.meta.url));
    return {
      app: '/nonexistent/loop-probe-x/app',
      state: '/nonexistent/loop-probe-x/state',
      script,
      features: '/nonexistent/loop-probe-x/features',
      warm: [],
      config: probeApp,
    };
  }),
);
