import * as BunWorker from '@effect/platform-bun/BunWorker';

export const renderWorkers = BunWorker.layer(
  () => new globalThis.Worker(new URL('./page-render-worker.ts', import.meta.url)),
);
