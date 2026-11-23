/**
 * Where a reference drive runs: the One app's own folder (its native
 * project and dev server), a state folder named for the new simulator, and
 * this folder as the features root, so the drive's contained host admits
 * the script it starts its dev server with.
 */
import type { App } from '@manna/sim/app';
import { launch } from '@manna/sim';
import { Effect, Path } from 'effect';

/** The warm checkouts no reference drive builds, installs or writes in. */
const WARM_CHECKOUTS: ReadonlyArray<string> = [
  '/Users/cvr/Developer/personal/manna',
  '/workspaces/bible-tools',
];

/** Runs the process's `sim` command for `config`, the One app in `apps/<folder>`, from the script at `url`. */
export const launchOne = (config: App, folder: string, url: string) =>
  launch(
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const script = yield* path.fromFileUrl(new URL(url));
      const here = path.dirname(script);
      const root = path.join(here, '..', '..', '..', '..');
      return {
        app: path.join(root, 'apps', folder),
        state: path.join(root, 'tmp', config.simulator),
        script,
        features: here,
        warm: WARM_CHECKOUTS,
        config,
      };
    }),
  );
