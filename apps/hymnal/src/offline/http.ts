/* oxlint-disable effect/noAsyncFunction, effect/noTryCatch, effect/noThrowStatement, effect/noGlobals, eslint/no-await-in-loop -- fetch adapter shared with One's native fetch: cancellation and bounded body consumption live inside Effect.tryPromise; release the host reader in the same operation. */
/** Bounded range transport works even on a host whose fetch buffers its response. */
import { Effect, Layer, Schema } from 'effect';
import { audioUrl, HYMNS_ORIGIN } from '~/remote';
import { CHUNK, Http, OfflineError, type Range } from './cache';

const rangeOf = (response: Response) => {
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '');
  const start = Number(range?.[1]),
    last = Number(range?.[2]),
    total = Number(range?.[3]);
  if (
    response.status !== 206 ||
    !range ||
    !Number.isSafeInteger(total) ||
    total <= last ||
    last < start ||
    last - start + 1 > CHUNK ||
    !response.headers.get('content-type')?.startsWith('audio/mpeg')
  )
    throw OfflineError.make({ code: 'invalid' });
  return { start, last, total };
};

export const httpLayer = (origin = HYMNS_ORIGIN) =>
  Layer.succeed(
    Http,
    Http.of({
      range: Effect.fn('Offline.range')(function* (id, at, end, etag) {
        return yield* Effect.tryPromise({
          try: async (signal): Promise<Range> => {
            const headers = new Headers({ Range: `bytes=${at}-${end}` });
            if (etag) headers.set('If-Range', etag);
            const uri = audioUrl(id.number, id.offset).replace(HYMNS_ORIGIN, origin);
            let response = await fetch(uri, { headers, signal });
            if (at > 0 && (response.status === 200 || response.status === 416)) {
              await response.body?.cancel();
              response = await fetch(uri, { headers: { Range: `bytes=0-${CHUNK - 1}` }, signal });
            }
            let parsed;
            try {
              parsed = rangeOf(response);
            } catch (error) {
              await response.body?.cancel();
              throw error;
            }
            const { start, last, total } = parsed;
            if (!response.body) throw OfflineError.make({ code: 'invalid' });
            const reader = response.body.getReader();
            const bytes = new Uint8Array(last - start + 1);
            let count = 0;
            try {
              for (;;) {
                const part = await reader.read();
                if (part.done) break;
                if (count + part.value.byteLength > bytes.byteLength) {
                  await reader.cancel();
                  throw OfflineError.make({ code: 'invalid' });
                }
                bytes.set(part.value, count);
                count += part.value.byteLength;
              }
            } finally {
              reader.releaseLock();
            }
            if (count !== bytes.byteLength) throw OfflineError.make({ code: 'invalid' });
            return { at: start, total, bytes, etag: response.headers.get('etag') ?? '' };
          },
          catch: (cause) => {
            if (Schema.is(OfflineError)(cause)) return cause;
            return OfflineError.make({ code: 'network' });
          },
        });
      }),
    }),
  );
