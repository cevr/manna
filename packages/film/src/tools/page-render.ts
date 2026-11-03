import {
  Boolean as Bool,
  Cause,
  Context,
  Deferred,
  Duration,
  Effect,
  Equal,
  Exit,
  Hash,
  FiberMap,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Queue,
  RcMap,
  Ref,
  Schema,
  type Scope,
  Stream,
} from 'effect';
import * as Worker from 'effect/workers/Worker';
import type { AppPage } from '../core/api.ts';
import type { PageAsked } from '../core/page-render.ts';
import { LONGEST_WAIT } from '../core/wait.ts';
import { renderWorkers } from './page-render-bun.ts';
import { FromRender, ToRender } from './page-render-protocol.ts';

interface BundledModule {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface ServerBundle {
  readonly files: ReadonlyArray<BundledModule>;
  readonly entries: ReadonlyMap<AppPage, string>;
}

export interface RenderBuild {
  readonly id: number;
  readonly bundle: ServerBundle;
}

export class RenderFailed extends Schema.TaggedError<RenderFailed>()('RenderFailed', {
  reason: Schema.String,
}) {}

type Read = (path: string) => Effect.Effect<Response>;

export interface RenderedPage {
  readonly head: string;
  readonly bodyClass: string;
  readonly markup: Stream.Stream<string, RenderFailed>;
}

interface PageRendererService {
  readonly render: (
    build: RenderBuild,
    page: AppPage,
    asked: PageAsked,
    read: Read,
  ) => Effect.Effect<RenderedPage, RenderFailed, Scope.Scope>;
}

export class PageRenderer extends Context.Service<PageRenderer, PageRendererService>()(
  '@manna/film/tools/PageRenderer',
) {
  static readonly layer: Layer.Layer<PageRenderer, never, FileSystem.FileSystem | Path.Path> =
    Layer.effect(
      PageRenderer,
      Effect.suspend(() => make),
    ).pipe(Layer.provide(renderWorkers));

  static readonly layerTest: Layer.Layer<PageRenderer> = Layer.succeed(
    PageRenderer,
    PageRenderer.of({
      render: (_build, page, asked) =>
        Effect.succeed({
          head: `<meta name="rendered" content="${page}">`,
          bodyClass: 'rendered',
          markup: Stream.make(
            '<main>',
            `${page} at ${asked.url}${Bool.match(asked.mac, { onTrue: () => ' for a Mac', onFalse: () => '' })}`,
            '</main>',
          ),
        }),
    }),
  );
}

const HEAD_WAIT = Duration.seconds(10);

export const END_WAIT = Duration.sum(Duration.seconds(LONGEST_WAIT), Duration.seconds(5));

interface Pending {
  readonly parts: Queue.Queue<FromRender>;
  readonly read: Read;
  readonly answering: FiberMap.FiberMap<number, void>;
}

interface BuildWorker {
  readonly render: (
    entry: string,
    asked: PageAsked,
    read: Read,
  ) => Effect.Effect<RenderedPage, RenderFailed, Scope.Scope>;
  readonly alive: Effect.Effect<boolean>;
}

const isLast = Predicate.or(Predicate.isTagged('End'), Predicate.isTagged('Failed'));

const pieceOf = (part: FromRender): Effect.Effect<string, RenderFailed> =>
  FromRender.$match(part, {
    Head: () => Effect.succeed(''),
    Chunk: ({ html }) => Effect.succeed(html),
    End: () => Effect.succeed(''),
    Read: () => Effect.succeed(''),
    ReadCancelled: () => Effect.succeed(''),
    Failed: ({ reason }) => Effect.fail(RenderFailed.make({ reason })),
  });

const spawnWorker = Effect.fnUntraced(function* (build: number, bundle: ServerBundle) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const platform = yield* Worker.WorkerPlatform;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: `lab-render-${build}-` });
  yield* Effect.forEach(
    bundle.files,
    (file) => {
      const at = path.join(dir, file.path);
      return Effect.andThen(
        fs.makeDirectory(path.dirname(at), { recursive: true }),
        fs.writeFile(at, file.bytes),
      );
    },
    { discard: true },
  );
  const worker = yield* platform.spawn<FromRender, ToRender>(build);
  const pending = new Map<number, Pending>();
  const gone = yield* Deferred.make<string>();
  let started = 0;

  const sendAnswer = (path: string, answer: ToRender) =>
    worker
      .send(answer)
      .pipe(
        Effect.catch((error) =>
          Effect.logWarning(`lab.render.read.failed build=${build} path=${path} ${error.message}`),
        ),
      );

  const answer = (render: Pending, asked: FromRender & { readonly _tag: 'Read' }) =>
    Effect.gen(function* () {
      const response = yield* render.read(asked.path);
      const body = new Uint8Array(yield* Effect.promise(() => response.arrayBuffer()));
      yield* Effect.logDebug(
        `lab.render.read build=${build} path=${asked.path} status=${response.status}`,
      );
      return ToRender.Answer({
        read: asked.read,
        status: response.status,
        headers: [...response.headers],
        body,
      });
    }).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
        const reason = String(Cause.squash(cause));
        return Effect.as(
          Effect.logWarning(
            `lab.render.read.failed build=${build} path=${asked.path} reason="${reason}"`,
          ),
          ToRender.Answer({
            read: asked.read,
            status: 502,
            headers: [['content-type', 'text/plain;charset=utf-8']],
            body: new TextEncoder().encode(reason),
          }),
        );
      }),
      Effect.flatMap((answered) => sendAnswer(asked.path, answered)),
    );

  const deliver = (message: FromRender): Effect.Effect<void> =>
    Option.match(Option.fromUndefinedOr(pending.get(message.id)), {
      onNone: () => Effect.void,
      onSome: (render) => {
        if (message._tag === 'Read')
          return Effect.asVoid(
            FiberMap.run(render.answering, message.read, answer(render, message)),
          );
        if (message._tag === 'ReadCancelled')
          return FiberMap.remove(render.answering, message.read);
        return Effect.asVoid(Queue.offer(render.parts, message));
      },
    });

  const stopped = (reason: string) =>
    Effect.andThen(
      Deferred.succeed(gone, reason),
      Effect.forEach(
        pending.entries(),
        ([id, render]) => Queue.offer(render.parts, FromRender.Failed({ id, reason })),
        { discard: true },
      ),
    );

  yield* worker.run(deliver).pipe(
    Effect.onExit((exit) =>
      Effect.andThen(
        Effect.when(
          Effect.logWarning(`lab.render.worker.failed build=${build}`, exit),
          Effect.succeed(Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)),
        ),
        stopped(`the render worker of build ${build} stopped`),
      ),
    ),
    Effect.forkScoped,
  );
  yield* Effect.log(`lab.render.worker.spawned build=${build} files=${bundle.files.length}`);

  const render = (entry: string, asked: PageAsked, read: Read) =>
    Effect.gen(function* () {
      started += 1;
      const id = started;
      const parts = yield* Queue.unbounded<FromRender>();
      const ended = yield* Ref.make(false);
      const answering = yield* FiberMap.make<number, void>();
      pending.set(id, { parts, read, answering });
      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          pending.delete(id);
          if (yield* Ref.get(ended)) return;
          yield* Effect.ignore(worker.send(ToRender.Cancel({ id })));
        }),
      );
      const failed = (reason: string) => RenderFailed.make({ reason });
      yield* worker
        .send(
          ToRender.Render({ id, module: path.join(dir, entry), url: asked.url, mac: asked.mac }),
        )
        .pipe(Effect.mapError((error) => failed(error.message)));
      const first = yield* Queue.take(parts).pipe(
        Effect.raceFirst(
          Effect.flatMap(Deferred.await(gone), (reason) => Effect.fail(failed(reason))),
        ),
        Effect.timeoutOrElse({
          duration: HEAD_WAIT,
          orElse: () => Effect.fail(failed(`no head in ${Duration.format(HEAD_WAIT)}`)),
        }),
      );
      if (first._tag === 'Failed') return yield* failed(first.reason);
      if (first._tag !== 'Head') return yield* failed(`a render began with ${first._tag}`);
      const markup = Stream.fromQueue(parts).pipe(
        Stream.takeUntil(isLast),
        Stream.mapEffect((part) =>
          Effect.tap(pieceOf(part), () => Ref.set(ended, part._tag !== 'Chunk')),
        ),
        Stream.filter((piece) => piece.length > 0),
        Stream.interruptWhen(
          Effect.andThen(
            Effect.sleep(END_WAIT),
            Effect.fail(failed(`no end in ${Duration.format(END_WAIT)} after its head`)),
          ),
        ),
      );
      return { head: first.html, bodyClass: first.bodyClass, markup } satisfies RenderedPage;
    });

  return {
    render,
    alive: Effect.map(Deferred.isDone(gone), (done) => !done),
  } satisfies BuildWorker;
});

class WorkerOf implements Equal.Equal {
  constructor(readonly build: RenderBuild) {}
  [Equal.symbol](that: Equal.Equal): boolean {
    return that instanceof WorkerOf && that.build.id === this.build.id;
  }
  [Hash.symbol](): number {
    return Hash.number(this.build.id);
  }
}

const make = Effect.gen(function* () {
  const workers = yield* RcMap.make({
    lookup: ({ build }: WorkerOf) =>
      Effect.andThen(
        Effect.addFinalizer(() => Effect.log(`lab.render.worker.retired build=${build.id}`)),
        spawnWorker(build.id, build.bundle).pipe(
          Effect.mapError((error) => RenderFailed.make({ reason: error.message })),
        ),
      ),
    idleTimeToLive: Duration.infinity,
  });
  const latest = yield* Ref.make(Option.none<RenderBuild>());

  const follow = (build: RenderBuild) =>
    Effect.flatMap(
      Ref.modify(latest, (before): [Option.Option<RenderBuild>, Option.Option<RenderBuild>] => {
        if (Option.exists(before, (b) => b.id >= build.id)) return [Option.none(), before];
        return [before, Option.some(build)];
      }),
      (old) =>
        Effect.forEach(Option.toArray(old), (o) => RcMap.invalidate(workers, new WorkerOf(o))),
    );

  const retireIfOlder = (build: RenderBuild) =>
    Effect.flatMap(Ref.get(latest), (now) =>
      Effect.when(
        RcMap.invalidate(workers, new WorkerOf(build)),
        Effect.succeed(Option.exists(now, (n) => n.id > build.id)),
      ),
    );

  const acquire = (build: RenderBuild) =>
    RcMap.get(workers, new WorkerOf(build)).pipe(
      Effect.tapError(() => RcMap.invalidate(workers, new WorkerOf(build))),
    );

  const workerOf = (build: RenderBuild): Effect.Effect<BuildWorker, RenderFailed, Scope.Scope> =>
    Effect.gen(function* () {
      const worker = yield* acquire(build);
      if (yield* worker.alive) return worker;
      yield* RcMap.invalidate(workers, new WorkerOf(build));
      return yield* acquire(build);
    });

  return PageRenderer.of({
    render: (build, page, asked, read) =>
      Effect.gen(function* () {
        const entry = yield* Effect.fromOption(
          Option.fromUndefinedOr(build.bundle.entries.get(page)),
        ).pipe(
          Effect.mapError(() =>
            RenderFailed.make({ reason: `build ${build.id} has no server entry for ${page}` }),
          ),
        );
        yield* follow(build);
        const worker = yield* workerOf(build);
        yield* retireIfOlder(build);
        return yield* worker.render(entry, asked, read);
      }),
  });
});
