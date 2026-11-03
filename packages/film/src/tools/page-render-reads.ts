import { Deferred, Effect, Option, Schema } from 'effect';
import { FromRender, type ToRender } from './page-render-protocol.ts';

const BODILESS: ReadonlyArray<number> = [101, 204, 205, 304];

const responseOf = (answer: ToRender & { readonly _tag: 'Answer' }): Response => {
  const headers = new Headers();
  for (const [name, value] of answer.headers) headers.append(name, value);
  const init = { status: answer.status, headers };
  // oxlint-disable-next-line effect/noNullish -- the web's Response takes null for an answer with no body
  if (BODILESS.includes(answer.status)) return new Response(null, init);
  return new Response(new Blob([new Uint8Array(answer.body)]), init);
};

class NotARead extends Schema.TaggedError<NotARead>()('NotARead', { message: Schema.String }) {}

const abortedBy = (signal: AbortSignal) =>
  Effect.callback<never, unknown>((resume) => {
    const aborted = () => resume(Effect.fail(signal.reason));
    signal.addEventListener('abort', aborted, { once: true });
    return Effect.sync(() => signal.removeEventListener('abort', aborted));
  });

interface RenderReads {
  readonly open: (id: number) => typeof globalThis.fetch;
  readonly close: (id: number) => void;
  readonly answer: (answer: ToRender & { readonly _tag: 'Answer' }) => Effect.Effect<void>;
  readonly held: (id: number) => number;
}

export const renderReads = (send: (message: FromRender) => void): RenderReads => {
  const reads = new Map<
    number,
    { readonly render: number; readonly answered: Deferred.Deferred<Response> }
  >();
  const renders = new Map<number, AbortController>();
  let readsMade = 0;

  const readOf = (id: number, request: Request, renderOver: AbortSignal) =>
    Effect.gen(function* () {
      if (request.method !== 'GET')
        return yield* NotARead.make({
          message: `a page's render only reads: ${request.method} ${request.url}`,
        });
      readsMade += 1;
      const made = readsMade;
      const answered = yield* Deferred.make<Response>();
      reads.set(made, { render: id, answered });
      const url = new URL(request.url);
      send(FromRender.Read({ id, read: made, path: `${url.pathname}${url.search}` }));
      return yield* Deferred.await(answered).pipe(
        Effect.onInterrupt(() =>
          Effect.sync(() => {
            if (!renderOver.aborted) send(FromRender.ReadCancelled({ id, read: made }));
          }),
        ),
        Effect.ensuring(Effect.sync(() => reads.delete(made))),
      );
    });

  const open = (id: number): typeof globalThis.fetch => {
    const over = new AbortController();
    renders.set(id, over);
    const read = (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const signal = AbortSignal.any([over.signal, request.signal]);
      return Effect.runPromise(
        Effect.gen(function* () {
          if (signal.aborted) return yield* Effect.fail(signal.reason);
          return yield* readOf(id, request, over.signal).pipe(Effect.raceFirst(abortedBy(signal)));
        }),
      );
    };
    return Object.assign(read, { preconnect: globalThis.fetch.preconnect });
  };

  return {
    open,
    close: (id) => {
      Option.map(Option.fromUndefinedOr(renders.get(id)), (over) => over.abort());
      renders.delete(id);
    },
    answer: (answer) =>
      Option.match(Option.fromUndefinedOr(reads.get(answer.read)), {
        onNone: () => Effect.void,
        onSome: ({ answered }) => {
          reads.delete(answer.read);
          return Deferred.succeed(answered, responseOf(answer));
        },
      }),
    held: (id) => [...reads.values()].filter((read) => read.render === id).length,
  };
};
