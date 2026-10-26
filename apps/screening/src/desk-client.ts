/**
 * The publisher's side of the desk (`./desk.ts`): what publishing a version
 * needs of the bucket, over HTTP with the stack's secret.
 *
 * `publishTo` runs a publication (`./publish.ts`) through it: it reads every
 * film's manifest the bucket holds, plans the version, uploads each file the
 * bucket does not already hold by its bytes (a file larger than a part in
 * parts), writes the version's page, the film's folder, its manifest and the
 * index in that order, then deletes the files of the version's folder the
 * new version no longer names. `--dry-run` stops before the first write.
 */
import { Array as Arr, Effect, FileSystem, Option, Redacted, Schema, Stream } from 'effect';
import { HttpClient, HttpClientRequest, type HttpClientResponse } from 'effect/http';

import { Begun, Listing, keyPath, PART_BYTES, SHA256_HEADER, UploadedPart } from './desk.ts';
import { type FilmManifest, FilmManifestJson, isManifestKey, manifestKey } from './manifest.ts';
import { type Material, type Publication, publication, type Upload } from './publish.ts';

export class DeskFailed extends Schema.TaggedError<DeskFailed>()('DeskFailed', {
  op: Schema.String,
  key: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the desk could not ${this.op} ${this.key}: ${this.reason}`;
  }
}

/** Where the desk is and the secret it answers to (`SCREENING_DESK_URL`, `SCREENING_DESK_TOKEN`). */
export interface DeskAccess {
  readonly url: string;
  readonly token: Redacted.Redacted<string>;
}

/** What one publish did, or would do (`dryRun`). */
export interface Published {
  readonly plan: Publication;
  /** The uploads the bucket already held, by key. */
  readonly held: ReadonlySet<string>;
  /** The files of the version's folder deleted once the new version was written. */
  readonly pruned: ReadonlyArray<string>;
}

const decodeListing = Schema.decodeUnknownEffect(Schema.fromJsonString(Listing));
const decodeBegun = Schema.decodeUnknownEffect(Schema.fromJsonString(Begun));
const decodePart = Schema.decodeUnknownEffect(Schema.fromJsonString(UploadedPart));
const encodeParts = Schema.encodeSync(
  Schema.fromJsonString(Schema.Struct({ parts: Schema.Array(UploadedPart) })),
);

/** The desk, as the publisher reaches it. */
export const deskClient = Effect.fn('desk.client')(function* (
  access: DeskAccess,
  partBytes: number = PART_BYTES,
) {
  const http = yield* HttpClient.HttpClient;
  const fs = yield* FileSystem.FileSystem;
  const base = access.url.replace(/\/+$/, '');
  const failed = (op: string, key: string) => (error: { readonly message: string }) =>
    DeskFailed.make({ op, key, reason: error.message });

  /** Send `request`, signed with the secret; a status `ok` does not admit is a failure. */
  const send = (
    op: string,
    key: string,
    request: HttpClientRequest.HttpClientRequest,
    ok: ReadonlyArray<number> = [200, 204],
  ) =>
    http.execute(HttpClientRequest.bearerToken(request, Redacted.value(access.token))).pipe(
      Effect.mapError(failed(op, key)),
      Effect.filterOrFail(
        (response) => ok.includes(response.status),
        (response) => DeskFailed.make({ op, key, reason: `the desk answered ${response.status}` }),
      ),
    );

  const textOf = (op: string, key: string) => (response: HttpClientResponse.HttpClientResponse) =>
    response.text.pipe(Effect.mapError(failed(op, key)));

  const list = (prefix: string, delimiter: Option.Option<string>) =>
    send(
      'list',
      prefix,
      HttpClientRequest.get(`${base}/keys`).pipe(
        HttpClientRequest.setUrlParams({
          prefix,
          ...Option.match(delimiter, {
            onNone: () => ({}),
            onSome: (each) => ({ delimiter: each }),
          }),
        }),
      ),
    ).pipe(
      Effect.flatMap(textOf('list', prefix)),
      Effect.flatMap((text) => decodeListing(text).pipe(Effect.mapError(failed('list', prefix)))),
    );

  /** Every film's manifest the bucket holds. */
  const manifests: Effect.Effect<ReadonlyArray<FilmManifest>, DeskFailed> = Effect.gen(
    function* () {
      const { folders } = yield* list('', Option.some('/'));
      const keys = folders
        .map((folder) => manifestKey(folder.replace(/\/$/, '')))
        .filter(isManifestKey);
      const found = yield* Effect.forEach(keys, (key) =>
        send(
          'read',
          key,
          HttpClientRequest.get(`${base}/objects/${keyPath(key)}`),
          [200, 404],
        ).pipe(
          Effect.flatMap((response) => {
            if (response.status === 404) return Effect.succeedNone;
            return textOf(
              'read',
              key,
            )(response).pipe(
              Effect.flatMap((text) =>
                Schema.decodeEffect(FilmManifestJson)(text).pipe(
                  Effect.mapError(failed('read', key)),
                ),
              ),
              Effect.asSome,
            );
          }),
        ),
      );
      return Arr.getSomes(found);
    },
  );

  /** Whether the bucket holds `key` with the bytes `sha256` names. */
  const holds = (key: string, sha256: string) =>
    send('check', key, HttpClientRequest.head(`${base}/objects/${keyPath(key)}`), [200, 404]).pipe(
      Effect.map(
        (response) =>
          response.status === 200 &&
          Option.contains(Option.fromNullishOr(response.headers[SHA256_HEADER]), sha256),
      ),
    );

  /** Bytes `offset` to `offset + length` of `file`. */
  const slice = (file: string, offset: number, length: number) =>
    fs.stream(file, { offset, bytesToRead: length }).pipe(
      Stream.runCollect,
      Effect.map((chunks) => {
        const out = new Uint8Array(length);
        let at = 0;
        for (const chunk of chunks) {
          out.set(chunk, at);
          at += chunk.length;
        }
        return out.subarray(0, at);
      }),
      Effect.mapError(failed('read', file)),
    );

  /** Write `upload` to the bucket: whole, or in parts when it is larger than one. */
  const upload = Effect.fn('desk.upload')(function* (each: Upload) {
    const objectUrl = `${base}/objects/${keyPath(each.key)}`;
    if (each.bytes <= partBytes) {
      const bytes = yield* slice(each.file, 0, each.bytes);
      yield* send(
        'upload',
        each.key,
        HttpClientRequest.put(objectUrl).pipe(
          HttpClientRequest.setHeader(SHA256_HEADER, each.sha256),
          HttpClientRequest.bodyUint8Array(bytes),
        ),
      );
      return;
    }
    const uploadUrl = `${base}/uploads/${keyPath(each.key)}`;
    const { uploadId } = yield* send(
      'begin',
      each.key,
      HttpClientRequest.post(uploadUrl).pipe(
        HttpClientRequest.setHeader(SHA256_HEADER, each.sha256),
      ),
    ).pipe(
      Effect.flatMap(textOf('begin', each.key)),
      Effect.flatMap((text) => decodeBegun(text).pipe(Effect.mapError(failed('begin', each.key)))),
    );
    const count = Math.ceil(each.bytes / partBytes);
    const parts = yield* Effect.forEach(
      Arr.range(1, count),
      (partNumber) =>
        Effect.gen(function* () {
          const offset = (partNumber - 1) * partBytes;
          const bytes = yield* slice(each.file, offset, Math.min(partBytes, each.bytes - offset));
          const response = yield* send(
            'upload part',
            `${each.key}#${partNumber}`,
            HttpClientRequest.put(uploadUrl).pipe(
              HttpClientRequest.setUrlParams({ upload: uploadId, part: `${partNumber}` }),
              HttpClientRequest.bodyUint8Array(bytes),
            ),
          );
          const text = yield* textOf('upload part', each.key)(response);
          return yield* decodePart(text).pipe(Effect.mapError(failed('upload part', each.key)));
        }),
      { concurrency: 2 },
    );
    yield* send(
      'finish',
      each.key,
      HttpClientRequest.post(uploadUrl).pipe(
        HttpClientRequest.setUrlParams({ upload: uploadId, complete: '' }),
        HttpClientRequest.bodyText(encodeParts({ parts }), 'application/json'),
      ),
    );
  });

  /** Write `text` to the bucket as `key`. */
  const write = (key: string, text: string) =>
    send(
      'write',
      key,
      HttpClientRequest.put(`${base}/objects/${keyPath(key)}`).pipe(
        HttpClientRequest.bodyText(text),
      ),
    ).pipe(Effect.asVoid);

  /** Delete `key`. */
  const remove = (key: string) =>
    send('delete', key, HttpClientRequest.delete(`${base}/objects/${keyPath(key)}`)).pipe(
      Effect.asVoid,
    );

  return { list, manifests, holds, upload, write, remove };
});

export type DeskClient = Effect.Success<ReturnType<typeof deskClient>>;

/** Publish `material` through `desk`; with `dryRun`, plan it and write nothing. */
export const publishTo = Effect.fn('desk.publish')(function* (
  desk: DeskClient,
  material: Material,
  dryRun: boolean,
) {
  const plan = publication(yield* desk.manifests, material);
  const holding = yield* Effect.forEach(plan.uploads, (each) => desk.holds(each.key, each.sha256), {
    concurrency: 8,
  });
  const held = new Set(plan.uploads.filter((_, i) => holding[i] === true).map((each) => each.key));
  if (dryRun) return { plan, held, pruned: [] } satisfies Published;
  yield* Effect.forEach(
    plan.uploads.filter((each) => !held.has(each.key)),
    (each) => desk.upload(each),
    { concurrency: 2 },
  );
  for (const text of plan.texts) yield* desk.write(text.key, text.text);
  // The version's folder keeps its page and the files the new version names; any other is the replaced one's.
  const folder = `${material.film}/${material.version}/`;
  const kept = new Set([...plan.uploads.map((each) => each.key), `${folder}index.html`]);
  const { keys } = yield* desk.list(folder, Option.none());
  const pruned = keys.filter((key) => !kept.has(key));
  yield* Effect.forEach(pruned, desk.remove, { concurrency: 4 });
  return { plan, held, pruned } satisfies Published;
});
