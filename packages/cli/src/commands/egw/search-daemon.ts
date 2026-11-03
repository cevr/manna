import { SearchQuery, SearchService } from '@manna/core/search';
import { BunServices, BunSocketServer } from '@effect/platform-bun';
import {
  Clock,
  Config,
  Console,
  Deferred,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Ref,
} from 'effect';
import { Command, Flag } from 'effect/cli';
import { RpcSerialization, RpcServer } from 'effect/rpc';

import { CliProcess } from '../../services/process.js';
import {
  CLIENT_FINGERPRINT,
  probeSearchDaemon,
  shutdownSearchDaemon,
} from './search-daemon-client.js';
import {
  SearchDaemonGroup,
  SearchDaemonStatus,
  searchDaemonSocketPath,
} from './search-daemon-protocol.js';
import { installedSearchLayer } from './search-layer.js';

const WARMUP_QUERY = SearchQuery.make({
  text: 'why does God permit trials to come upon his people',
  scope: Option.none(),
  bookCode: Option.none(),
  limit: Option.some(1),
});

const idleCheckInterval = (idleMillis: number): Duration.Duration =>
  Duration.millis(Math.min(Math.max(idleMillis, 50), 60_000));

type SearchDaemonOutcome = 'already-running' | 'idle' | 'retired';

export const runSearchDaemon = (options: {
  readonly socketPath: string;
  readonly idleMillis: number;
  readonly pid: number;
}): Effect.Effect<SearchDaemonOutcome, never, SearchService | FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const occupied = yield* fs.exists(options.socketPath).pipe(Effect.orElseSucceed(() => false));
    if (occupied) {
      const resident = yield* probeSearchDaemon(options.socketPath);
      if (Option.isSome(resident)) return 'already-running';
      yield* fs.remove(options.socketPath).pipe(Effect.ignore);
    }

    const lastActivity = yield* Ref.make(yield* Clock.currentTimeMillis);
    const retire = yield* Deferred.make<'retired'>();
    const touch = Clock.currentTimeMillis.pipe(Effect.flatMap((now) => Ref.set(lastActivity, now)));

    const handlers = SearchDaemonGroup.toLayer(
      Effect.gen(function* () {
        const search = yield* SearchService;
        return {
          'search.query': (query) => touch.pipe(Effect.andThen(search.query(query))),
          'daemon.status': () =>
            touch.pipe(
              Effect.as(
                SearchDaemonStatus.make({ pid: options.pid, fingerprint: CLIENT_FINGERPRINT }),
              ),
            ),
          'daemon.shutdown': () =>
            Deferred.succeed(retire, 'retired').pipe(
              Effect.delay(Duration.millis(150)),
              Effect.forkDetach,
              Effect.asVoid,
            ),
        };
      }),
    );

    const server = RpcServer.layer(SearchDaemonGroup).pipe(
      Layer.provide(handlers),
      Layer.provide(RpcServer.layerProtocolSocketServer),
      Layer.provide(RpcSerialization.layerNdjson),
      Layer.provide(BunSocketServer.layer({ path: options.socketPath })),
    );

    const warmup = Effect.flatMap(SearchService, (search) => search.query(WARMUP_QUERY)).pipe(
      Effect.ignore,
    );

    const idle = Effect.gen(function* () {
      for (;;) {
        yield* Effect.sleep(idleCheckInterval(options.idleMillis));
        const last = yield* Ref.get(lastActivity);
        const now = yield* Clock.currentTimeMillis;
        if (now - last >= options.idleMillis) return 'idle' as const;
      }
    });

    const outcome = yield* Effect.gen(function* () {
      yield* Effect.forkChild(warmup);
      return yield* Layer.launch(server).pipe(
        Effect.raceFirst(Deferred.await(retire)),
        Effect.raceFirst(idle),
      );
    }).pipe(Effect.orDie, Effect.scoped);

    yield* fs.remove(options.socketPath).pipe(Effect.ignore);
    return outcome;
  });

const stop = Flag.Boolean('stop').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Ask the running daemon to exit'),
);

const idleMinutes = Flag.Int('idle-minutes').pipe(
  Flag.withDefault(15),
  Flag.withDescription('Exit after this long without a request (default: 15)'),
);

const serveDaemon = (input: { readonly socketPath: string; readonly idleMillis: number }) =>
  Effect.gen(function* () {
    const cliProcess = yield* CliProcess;
    yield* Console.error(`search daemon listening on ${input.socketPath}`);
    const outcome = yield* runSearchDaemon({
      socketPath: input.socketPath,
      idleMillis: input.idleMillis,
      pid: cliProcess.pid,
    });
    yield* Console.error(`search daemon exiting (${outcome})`);
  }).pipe(Effect.provide(Layer.mergeAll(installedSearchLayer, BunServices.layer)));

export const egwDaemon = Command.make('daemon', { stop, idleMinutes }, (args) =>
  Effect.gen(function* () {
    const home = yield* Config.String('HOME');
    const socketPath = searchDaemonSocketPath(home);

    if (args.stop) {
      const resident = yield* probeSearchDaemon(socketPath);
      if (Option.isNone(resident)) {
        yield* Console.log('No search daemon is running.');
        return;
      }
      yield* shutdownSearchDaemon(socketPath);
      yield* Console.log(`Search daemon (pid ${String(resident.value.pid)}) asked to exit.`);
      return;
    }

    yield* serveDaemon({ socketPath, idleMillis: args.idleMinutes * 60_000 });
  }),
);
