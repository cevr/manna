import { Context, type Effect, type Option } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { bunManifestLock } from './manifest-lock-bun.ts';

/** The locks of manifests, one per manifest's path, across this host's processes. */
export interface ManifestLockService {
  /**
   * Try once, without waiting, to hold the lock of the manifest at `file`:
   * what lets it go when held, none while another holder (of this process or
   * any other) has it.
   */
  readonly take: (file: string) => Effect.Effect<Option.Option<Effect.Effect<void>>, PlatformError>;
}

/** This host's manifest locks: SQLite's, on Bun. Tests set it. */
export const ManifestLock = Context.Reference<ManifestLockService>(
  '@manna/film/tools/ManifestLock',
  { defaultValue: () => bunManifestLock },
);
