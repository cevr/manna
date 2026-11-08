/**
 * The mirror's list, keys and headers, and what the copy (`./job.ts`) does
 * with each file, decided from the file's cached bytes and R2's listing and
 * nothing else: no store is called here.
 *
 * The mirror carries the download's pinned files and the second voice's pack
 * (`AM_MICHAEL`), one list in path order, each under
 * `kokoro/<revision>/<path>`, so `MIRROR + path` is always its public URL.
 *
 * A key is never replaced: R2 holding it with the file's size and MD5 is
 * kept, R2 lacking it is uploaded, and R2 holding other bytes is a conflict,
 * never put. That is what makes the `immutable` cache header true: a new
 * revision is a new folder.
 */
import { Array as Arr, Data, Option, Order } from 'effect';

import { AM_MICHAEL, FILES, REVISION } from '../../src/natural/manifest.ts';
import type { ModelFile } from '../../src/natural/module.ts';

/** The 39 files the mirror holds: the download's 38 and `am_michael.bin`, in path order. */
export const MIRROR_FILES: ReadonlyArray<ModelFile> = Arr.sort(
  [...FILES, AM_MICHAEL],
  Order.mapInput(Order.String, (file: ModelFile) => file.path),
);

/** Where the revision's files live in the bucket. */
export const PREFIX = `kokoro/${REVISION}/`;

/** The bucket key of a file of the list. */
export const keyOf = (path: string) => `${PREFIX}${path}`;

/** A key is never replaced and a new revision is a new folder, so the edge keeps each a year. */
export const CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** One non-text type for every file, so the edge never compresses one and serves the stored bytes. */
export const CONTENT_TYPE = 'application/octet-stream';

/** An object as R2 lists or stores it: its size and its ETag. */
export interface MirrorObject {
  readonly size: number;
  readonly etag: string;
}

/** Whether R2's object is the file: the same size, and an ETag that is its MD5, quoted or not, in any case. */
export const holds = (object: MirrorObject, size: number, md5: string) =>
  object.size === size && object.etag.replaceAll('"', '').toLowerCase() === md5.toLowerCase();

/** A file of the list with its cached bytes' MD5. */
export interface Cached {
  readonly file: ModelFile;
  readonly md5: string;
}

export type CopyItem = Data.TaggedEnum<{
  /** R2 holds the key with the file's size and MD5. */
  Keep: { readonly file: ModelFile; readonly key: string };
  /** R2 lacks the key. */
  Upload: { readonly file: ModelFile; readonly key: string; readonly md5: string };
  /** R2 holds the key with other bytes: never put, the fix is a new revision. */
  Conflict: { readonly file: ModelFile; readonly key: string; readonly held: MirrorObject };
}>;
export const CopyItem = Data.taggedEnum<CopyItem>();

/** Each file's item, in list order, against R2's listing of the prefix. */
export const planCopy = (
  cached: ReadonlyArray<Cached>,
  listing: ReadonlyMap<string, MirrorObject>,
): ReadonlyArray<CopyItem> =>
  cached.map(({ file, md5 }) => {
    const key = keyOf(file.path);
    return Option.match(Option.fromUndefinedOr(listing.get(key)), {
      onNone: () => CopyItem.Upload({ file, key, md5 }),
      onSome: (held) => {
        if (holds(held, file.bytes, md5)) return CopyItem.Keep({ file, key });
        return CopyItem.Conflict({ file, key, held });
      },
    });
  });
