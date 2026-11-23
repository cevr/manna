/**
 * A drive that starts its launches on home, not on the first minute: a
 * launch at the Garden tab's root on a store with no verse said opens the
 * first minute's welcome (features/start.contract), as the current app
 * does, so each run that names no location of its own opens at `/verses`,
 * which the launch keeps, and goes Back to home before its own ops. The
 * replies of those four steps are dropped, so the drive's replies stay
 * those of its own ops. A drive of the first minute itself uses
 * `makeDrive` alone.
 */

import type { makeDrive } from '@manna/exact-kit/drive';

type Drive = ReturnType<typeof makeDrive>;

/** The steps that leave the location the launch kept for home. */
const TO_HOME = ['clock data', 'clock settle', 'back', 'clock settle'] as const;

/** `drive` with each run that names no `--url` opened on home first. */
export const fromHome = (drive: Drive): Drive => {
  const run = (flags: ReadonlyArray<string>, ops: ReadonlyArray<string>) => {
    if (flags.includes('--url')) return drive.run(flags, ops);
    return drive
      .run([...flags, '--url', '/verses'], [...TO_HOME, ...ops])
      .then((replies) => replies.slice(TO_HOME.length));
  };
  return {
    ...drive,
    run,
    launch: (store, ops) => run(['--storage', store, '--reset-storage'], ops),
    relaunch: (store, ops) => run(['--storage', store, '--keep-storage'], ops),
  };
};
