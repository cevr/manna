import { Effect } from 'effect';
import type { ContentStore, Manifest } from './content-store.ts';

declare const store: ContentStore['Service'];
declare const manifest: Manifest<ReadonlyArray<string>>;

// @ts-expect-error a path and a bare effect: the holder would read for itself
export const bare = store.holding(manifest.file, Effect.void);

// @ts-expect-error the change is handed the manifest as read under the lock, of the manifest's type
export const mistyped = store.holding(manifest, (current: number) => Effect.succeed(current));

/** The change decides from the manifest as read under the lock. */
export const decided = store.holding(manifest, (current) =>
  Effect.succeed(current.includes('three')),
);
