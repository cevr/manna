import { Array as Arr, Effect, Option, Schema } from 'effect';

import {
  DOCUMENT_PREFIX,
  MODEL_FINGERPRINT,
  QUERY_PREFIX,
  type QueryEmbedderApi,
  QueryEmbedderUnavailable,
  quantize,
  truncateToMrl,
} from '@manna/core/search';

export const EMBEDDING_MODEL = '@cf/google/embeddinggemma-300m';

const ADAPTER = 'workers-ai';

const EmbeddingOutput = Schema.Struct({
  data: Schema.Array(Schema.Array(Schema.Finite)),
});

const unavailable = (reason: string) => QueryEmbedderUnavailable.make({ adapter: ADAPTER, reason });

export const EMBEDDING_BATCH = 100;

type Run<E> = (inputs: { readonly text: string[] }) => Effect.Effect<unknown, E>;

const embedBatch =
  <E>(run: Run<E>) =>
  (texts: readonly string[]) =>
    run({ text: [...texts] }).pipe(
      Effect.mapError((cause) => unavailable(String(cause))),
      Effect.flatMap((output) =>
        Schema.decodeUnknownEffect(EmbeddingOutput)(output).pipe(
          Effect.mapError((issue) => unavailable(`unexpected output: ${String(issue)}`)),
        ),
      ),
      Effect.flatMap((output) => {
        if (output.data.length !== texts.length) {
          return Effect.fail(
            unavailable(
              `asked for ${String(texts.length)} embeddings, got ${String(output.data.length)}`,
            ),
          );
        }
        return Effect.forEach(output.data, (values) =>
          Option.match(truncateToMrl(values), {
            onNone: () => Effect.fail(unavailable('no usable 256-d embedding in the output')),
            onSome: (truncated) => Effect.succeed(quantize(truncated)),
          }),
        );
      }),
    );

export const workersAiEmbedder = <E>(run: Run<E>): QueryEmbedderApi => {
  const embed = (prefix: string) => (text: string) =>
    embedBatch(run)([`${prefix}${text}`]).pipe(
      Effect.flatMap((vectors) =>
        Effect.fromOption(Arr.head(vectors)).pipe(
          Effect.mapError(() => unavailable('no usable 256-d embedding in the output')),
        ),
      ),
    );
  return {
    fingerprint: MODEL_FINGERPRINT,
    embedQuery: embed(QUERY_PREFIX),
    embedDocument: embed(DOCUMENT_PREFIX),
  };
};

export const workersAiDocuments =
  <E>(run: Run<E>) =>
  (texts: readonly string[]): Effect.Effect<readonly Int8Array[], QueryEmbedderUnavailable> =>
    Effect.forEach(Arr.chunksOf(texts, EMBEDDING_BATCH), (batch) =>
      embedBatch(run)(batch.map((text) => `${DOCUMENT_PREFIX}${text}`)),
    ).pipe(Effect.map(Arr.flatten));
