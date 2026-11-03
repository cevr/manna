import { SearchService, type SearchQuery } from '@manna/core/search';
import { BunSocket } from '@effect/platform-bun';
import type { Option } from 'effect';
import { Effect, Layer, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { RpcClient, RpcSerialization } from 'effect/rpc';

import { selfInvocation } from '../../lib/paths.js';
import {
  DAEMON_FINGERPRINT,
  SearchDaemonGroup,
  type SearchDaemonStatus,
} from './search-daemon-protocol.js';

const clientProtocol = (socketPath: string) =>
  RpcClient.layerProtocolSocket().pipe(
    Layer.provide(BunSocket.layerNet({ path: socketPath })),
    Layer.provide(RpcSerialization.layerNdjson),
  );

const PROBE_TIMEOUT_MILLIS = 1500;

export const probeSearchDaemon = (
  socketPath: string,
): Effect.Effect<Option.Option<SearchDaemonStatus>> =>
  Effect.gen(function* () {
    const client = yield* RpcClient.make(SearchDaemonGroup);
    return yield* client['daemon.status']();
  }).pipe(
    Effect.scoped,
    Effect.provide(clientProtocol(socketPath)),
    Effect.timeout(PROBE_TIMEOUT_MILLIS),
    Effect.option,
  );

export const shutdownSearchDaemon = (socketPath: string): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const client = yield* RpcClient.make(SearchDaemonGroup);
    yield* client['daemon.shutdown']();
    return true;
  }).pipe(
    Effect.scoped,
    Effect.provide(clientProtocol(socketPath)),
    Effect.timeout(PROBE_TIMEOUT_MILLIS),
    Effect.orElseSucceed(() => false),
  );

export const searchDaemonClientLayer = (socketPath: string): Layer.Layer<SearchService> =>
  Layer.effect(
    SearchService,
    Effect.gen(function* () {
      const client = yield* RpcClient.make(SearchDaemonGroup);
      return SearchService.of({
        query: (query: SearchQuery) => client['search.query'](query).pipe(Effect.orDie),
      });
    }),
  ).pipe(Layer.provide(clientProtocol(socketPath)), Layer.orDie);

class SearchDaemonSpawnError extends Schema.TaggedError<SearchDaemonSpawnError>()(
  'SearchDaemonSpawnError',
  { message: Schema.String },
) {}

export const spawnSearchDaemon: Effect.Effect<
  void,
  SearchDaemonSpawnError,
  ChildProcessSpawner.ChildProcessSpawner
> = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const self = selfInvocation();
  const handle = yield* spawner.spawn(
    ChildProcess.make(self.command, [...self.args, 'egw', 'daemon'], {
      detached: true,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
      forceKillAfter: '5 seconds',
    }),
  );
  const _reref = yield* handle.unref;
}).pipe(
  Effect.scoped,
  Effect.mapError((cause) =>
    SearchDaemonSpawnError.make({ message: `daemon spawn failed: ${String(cause)}` }),
  ),
);

export const CLIENT_FINGERPRINT = DAEMON_FINGERPRINT;
