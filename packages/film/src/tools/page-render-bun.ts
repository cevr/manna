import * as BunWorker from '@effect/platform-bun/BunWorker';

/** The workers a build's renders run in: each a Bun worker of `page-render-worker.ts`. */
export const renderWorkers = BunWorker.layer(
  () => new globalThis.Worker(new URL('./page-render-worker.ts', import.meta.url)),
);
