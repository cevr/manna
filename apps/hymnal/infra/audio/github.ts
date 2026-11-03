import { Effect, Layer, Option, Schedule, Schema } from 'effect';
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http';

import type { FillEntry } from './stores.ts';
import { Fill, StoreFailed } from './stores.ts';

const COMMIT = '4645e76cda1ed7eb8a95a6b59a1d29789406bbf8';
const REPO = 'cevr/sda-hymns';

const TREE_URL = `https://api.github.com/repos/${REPO}/git/trees/${COMMIT}?recursive=1`;

const rawUrl = (path: string) =>
  `https://raw.githubusercontent.com/${REPO}/${COMMIT}/${path.split('/').map(encodeURIComponent).join('/')}`;

const Tree = Schema.Struct({
  truncated: Schema.Boolean,
  tree: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      type: Schema.String,
      sha: Schema.String,
      size: Schema.optional(Schema.Finite),
    }),
  ),
});

const failure = (reason: string) => StoreFailed.make({ store: 'github', reason });

const TIMEOUT = '3 minutes';

const within =
  (what: string) =>
  <A, E, R>(self: Effect.Effect<A, E, R>) =>
    Effect.timeoutOrElse(self, {
      duration: TIMEOUT,
      orElse: () => Effect.fail(failure(`${what}: no answer in ${TIMEOUT}`)),
    });

const RECORDING = /^mp3\/(\d+) .*\.mp3$/u;

const recordings = (
  tree: typeof Tree.Type,
): Effect.Effect<ReadonlyMap<number, FillEntry>, StoreFailed> => {
  if (tree.truncated) return Effect.fail(failure('the tree came back truncated'));
  const entries = new Map<number, FillEntry>();
  for (const node of tree.tree) {
    const hymn = Option.fromNullishOr(RECORDING.exec(node.path)?.[1]).pipe(Option.map(Number));
    const size = Option.fromUndefinedOr(node.size);
    if (node.type !== 'blob' || Option.isNone(hymn) || Option.isNone(size)) continue;
    if (entries.has(hymn.value)) {
      return Effect.fail(failure(`hymn ${hymn.value} has two recordings in the tree`));
    }
    entries.set(hymn.value, { hymn: hymn.value, path: node.path, size: size.value, sha: node.sha });
  }
  return Effect.succeed(entries);
};

export const FillGitHub = Layer.effect(
  Fill,
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest(HttpClientRequest.setHeader('user-agent', 'manna-audio-copy')),
      HttpClient.filterStatusOk,
      HttpClient.retryTransient({ schedule: Schedule.exponential('250 millis'), times: 4 }),
    );

    const tree = client.get(TREE_URL, { headers: { accept: 'application/vnd.github+json' } }).pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Tree)),
      Effect.mapError((error) => failure(`tree ${COMMIT}: ${error.message}`)),
      within(`tree ${COMMIT}`),
      Effect.flatMap(recordings),
      Effect.withSpan('Fill.tree'),
    );

    const get = Effect.fn('Fill.get')(function* (entry: FillEntry) {
      const body = yield* client.get(rawUrl(entry.path)).pipe(
        Effect.flatMap((response) => response.arrayBuffer),
        Effect.mapError((error) => failure(`${entry.path}: ${error.message}`)),
        within(entry.path),
      );
      return new Uint8Array(body);
    });

    return Fill.of({ tree, get });
  }),
);
