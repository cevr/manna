import { MODEL_FINGERPRINT, SearchQuery, SearchResult } from '@manna/core/search';
import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

const SEARCH_DAEMON_WIRE = 2;

export const DAEMON_FINGERPRINT = `${MODEL_FINGERPRINT}+wire.${String(SEARCH_DAEMON_WIRE)}`;

export class SearchDaemonStatus extends Schema.Class<SearchDaemonStatus>(
  'cli/egw/SearchDaemonStatus',
)({
  pid: Schema.Int,
  fingerprint: Schema.NonEmptyString,
}) {}

const SearchDaemonStatusRpc = Rpc.make('daemon.status', {
  success: SearchDaemonStatus,
});

const SearchDaemonShutdownRpc = Rpc.make('daemon.shutdown', {});

const SearchQueryRpc = Rpc.make('search.query', {
  payload: SearchQuery,
  success: SearchResult,
});

export const SearchDaemonGroup = RpcGroup.make(
  SearchQueryRpc,
  SearchDaemonStatusRpc,
  SearchDaemonShutdownRpc,
);

export const searchDaemonSocketPath = (home: string): string => `${home}/.bible/search-daemon.sock`;
