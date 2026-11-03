/**
 * `bun run sim <command>`: drive the hymnal on the `verify-hymnal` simulator
 * or in a headless browser, one JSON result per command on stdout. The
 * driver is `@manna/sim` (`packages/sim`); the hymnal's values are
 * `scripts/sim-app.ts`. The verify-hymnal skill (`.claude/skills/verify-hymnal`)
 * drives through it.
 */
import { launch } from '@manna/sim';
import { Effect, Path } from 'effect';

import { app as config } from './sim-app.ts';

/**
 * The warm checkouts: the clean sources worktrees are made from, on the
 * laptop and on the workbox. No command builds, installs or writes in one.
 */
const WARM_CHECKOUTS: ReadonlyArray<string> = [
  '/Users/cvr/Developer/personal/manna',
  '/workspaces/bible-tools',
];

launch(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const script = yield* path.fromFileUrl(new URL(import.meta.url));
    const app = path.dirname(path.dirname(script));
    const root = path.join(app, '..', '..');
    return {
      app,
      state: path.join(root, 'tmp', config.simulator),
      script,
      features: path.join(root, '.claude', 'skills', 'verify-hymnal', 'features'),
      warm: WARM_CHECKOUTS,
      config,
    };
  }),
);
