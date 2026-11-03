import * as BunWorkerRunner from '@effect/platform-bun/BunWorkerRunner';
import { Deferred, Effect, Exit, FiberMap } from 'effect';
import * as WorkerRunner from 'effect/workers/WorkerRunner';
import { type PageSink, isPageRender } from '../core/page-render.ts';
import { FromRender, ToRender } from './page-render-protocol.ts';
import { renderReads } from './page-render-reads.ts';

const serverEntry = (module: string): Promise<unknown> => import(module);

const serve = Effect.gen(function* () {
  const runner = yield* (yield* WorkerRunner.WorkerRunnerPlatform).start<FromRender, ToRender>();
  const send = (message: FromRender) => runner.sendUnsafe(0, message);
  const reads = renderReads(send);
  const renders = yield* FiberMap.make<number>();

  const render = (message: ToRender & { readonly _tag: 'Render' }) => {
    const { id } = message;
    return Effect.gen(function* () {
      const live = yield* Effect.acquireRelease(
        Effect.sync(() => ({ controller: new AbortController(), open: true })),
        (owned, exit) =>
          Effect.sync(() => {
            owned.open = false;
            if (Exit.hasInterrupts(exit)) owned.controller.abort();
            reads.close(id);
          }),
      );
      const loaded = yield* Effect.tryPromise({
        try: () => serverEntry(message.module),
        catch: (cause) => `the page's server entry did not load: ${String(cause)}`,
      });
      const page: unknown = Reflect.get(Object(loaded), 'default');
      if (!isPageRender(page))
        return yield* Effect.fail("the page's server entry exports no PageRender as its default");
      const over = yield* Deferred.make<void, string>();
      const say = (said: FromRender) => {
        if (live.open) send(said);
      };
      let headed = false;
      const head = (html: string) => {
        if (headed) return;
        headed = true;
        say(FromRender.Head({ id, html, bodyClass: page.bodyClass }));
      };
      const sink: PageSink = {
        head,
        write: (html) => {
          head('');
          say(FromRender.Chunk({ id, html }));
        },
        end: () => {
          head('');
          say(FromRender.End({ id }));
          Deferred.doneUnsafe(over, Exit.void);
        },
        fail: (reason) => Deferred.doneUnsafe(over, Exit.fail(reason)),
      };
      yield* Effect.try({
        try: () =>
          page.render(
            {
              url: message.url,
              mac: message.mac,
              fetch: reads.open(id),
              signal: live.controller.signal,
            },
            sink,
          ),
        catch: (cause) => `the page's render threw: ${String(cause)}`,
      });
      yield* Deferred.await(over);
    }).pipe(
      Effect.scoped,
      Effect.catch((reason) => Effect.sync(() => send(FromRender.Failed({ id, reason })))),
    );
  };

  return yield* runner.run((_port, message: ToRender) =>
    ToRender.$match(message, {
      Render: (asked) => Effect.asVoid(FiberMap.run(renders, asked.id, render(asked))),
      Cancel: ({ id }) => FiberMap.remove(renders, id),
      Answer: reads.answer,
    }),
  );
});

Effect.runFork(serve.pipe(Effect.scoped, Effect.provide(BunWorkerRunner.layer)));
