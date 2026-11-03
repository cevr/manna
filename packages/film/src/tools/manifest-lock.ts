import { Context, type Effect, type Option } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { bunManifestLock } from './manifest-lock-bun.ts';

export interface ManifestLockService {
  readonly take: (file: string) => Effect.Effect<Option.Option<Effect.Effect<void>>, PlatformError>;
}

export const ManifestLock = Context.Reference<ManifestLockService>(
  '@manna/film/tools/ManifestLock',
  { defaultValue: () => bunManifestLock },
);
