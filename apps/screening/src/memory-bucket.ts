/**
 * The bucket in memory, as both Workers see it: the desk writes it
 * (`Store`, `./desk.ts`) and the site reads it (`Shelf`, `./respond.ts`).
 * The tests run a publish and the site over one of these. It holds the
 * hosts' limits: a request body (a whole write, a part) of `maxBody` bytes at
 * most, as a Worker takes, and R2's rule for a multipart write, every part
 * but the last of one size.
 */
import { Effect, Option } from 'effect';

import type { Store, UploadedPart } from './desk.ts';
import type { Shelf } from './respond.ts';

interface Held {
  readonly bytes: Uint8Array;
  readonly sha256: Option.Option<string>;
}

export const memoryBucket = (maxBody: number) => {
  const bounded = (bytes: Uint8Array) =>
    Effect.suspend(() => {
      if (bytes.length > maxBody)
        return Effect.die(`a body of ${bytes.length} bytes is over the host's ${maxBody}`);
      return Effect.void;
    });
  const objects = new Map<string, Held>();
  const uploads = new Map<
    string,
    {
      readonly key: string;
      readonly sha256: Option.Option<string>;
      readonly parts: Map<number, Uint8Array>;
    }
  >();
  let next = 0;

  const store: Store = {
    list: (prefix, delimiter) =>
      Effect.sync(() => {
        const under = [...objects.keys()].filter((key) => key.startsWith(prefix)).sort();
        return Option.match(delimiter, {
          onNone: () => ({ keys: under, folders: [] }),
          onSome: (mark) => {
            const folders = new Set<string>();
            const keys: string[] = [];
            for (const key of under) {
              const rest = key.slice(prefix.length);
              const cut = rest.indexOf(mark);
              if (cut < 0) keys.push(key);
              else folders.add(`${prefix}${rest.slice(0, cut + mark.length)}`);
            }
            return { keys, folders: [...folders].sort() };
          },
        });
      }),
    read: (key) =>
      Effect.sync(() => Option.map(Option.fromNullishOr(objects.get(key)), (held) => held.bytes)),
    hashOf: (key) =>
      Effect.sync(() => Option.map(Option.fromNullishOr(objects.get(key)), (held) => held.sha256)),
    write: (key, bytes, sha256) =>
      bounded(bytes).pipe(
        Effect.andThen(Effect.sync(() => void objects.set(key, { bytes, sha256 }))),
      ),
    remove: (key) => Effect.sync(() => void objects.delete(key)),
    begin: (key, sha256) =>
      Effect.sync(() => {
        next += 1;
        const id = `upload-${next}`;
        uploads.set(id, { key, sha256, parts: new Map() });
        return id;
      }),
    part: (key, uploadId, partNumber, bytes) =>
      bounded(bytes).pipe(
        Effect.andThen(
          Effect.suspend(() => {
            const upload = uploads.get(uploadId);
            if (!upload || upload.key !== key) return Effect.die(`no upload ${uploadId} of ${key}`);
            upload.parts.set(partNumber, bytes);
            return Effect.succeed<UploadedPart>({ partNumber, etag: `etag-${partNumber}` });
          }),
        ),
      ),
    finish: (key, uploadId, parts) =>
      Effect.suspend(() => {
        const upload = uploads.get(uploadId);
        if (!upload || upload.key !== key) return Effect.die(`no upload ${uploadId} of ${key}`);
        const ordered = [...parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((part) => upload.parts.get(part.partNumber) ?? new Uint8Array());
        const sizes = ordered.slice(0, -1).map((bytes) => bytes.length);
        if (new Set(sizes).size > 1)
          return Effect.die('the parts but the last are not of one size');
        const whole = new Uint8Array(ordered.reduce((sum, bytes) => sum + bytes.length, 0));
        let at = 0;
        for (const bytes of ordered) {
          whole.set(bytes, at);
          at += bytes.length;
        }
        objects.set(key, { bytes: whole, sha256: upload.sha256 });
        uploads.delete(uploadId);
        return Effect.void;
      }),
  };

  const shelf: Shelf = {
    head: (key) =>
      Effect.sync(() =>
        Option.map(Option.fromNullishOr(objects.get(key)), (held) => ({
          size: held.bytes.length,
          etag: `"${key}"`,
        })),
      ),
    get: (key, span) =>
      Effect.sync(() =>
        Option.map(Option.fromNullishOr(objects.get(key)), (held) => ({
          head: { size: held.bytes.length, etag: `"${key}"` },
          body: Option.match(span, {
            onNone: () => held.bytes,
            onSome: ({ offset, length }) => held.bytes.slice(offset, offset + length),
          }),
        })),
      ),
  };

  return { objects, store, shelf };
};
