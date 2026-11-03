import { DIMENSIONS, MODEL_FINGERPRINT, QueryEmbedder } from '@manna/core/search';
import { Clock, Console, Effect, FileSystem, Option, Schema } from 'effect';

import { paragraphIdentity } from '@manna/core/egw-db';

import type { VectorSourceRow } from './emit.js';

const identityOf = (row: VectorSourceRow): string =>
  paragraphIdentity(row.bookCode, Option.some(row.paraId), row.refcode);

const FLUSH_EVERY = 500;

class VectorCheckpoint extends Schema.Class<VectorCheckpoint>('VectorCompiler/VectorCheckpoint')({
  fingerprint: Schema.NonEmptyString,
  dimensions: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThan(0))),
  completed: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
  lastIdentity: Schema.NonEmptyString,
}) {}

const CheckpointJson = Schema.fromJsonString(VectorCheckpoint);
const decodeCheckpoint = Schema.decodeEffect(CheckpointJson);
const encodeCheckpoint = Schema.encodeEffect(CheckpointJson);

class CompilerEmbedError extends Schema.TaggedError<CompilerEmbedError>()('CompilerEmbedError', {
  message: Schema.String,
}) {}

export const partPath = (out: string): string => `${out}.part`;
export const checkpointPath = (out: string): string => `${out}.checkpoint.json`;

const resumePoint = (
  rows: readonly VectorSourceRow[],
  out: string,
): Effect.Effect<number, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const fresh = Effect.gen(function* () {
      yield* fs.remove(partPath(out)).pipe(Effect.ignore);
      yield* fs.remove(checkpointPath(out)).pipe(Effect.ignore);
      return 0;
    });

    const read = yield* fs
      .readFileString(checkpointPath(out))
      .pipe(Effect.flatMap(decodeCheckpoint), Effect.option);
    if (Option.isNone(read)) return yield* fresh;
    const checkpoint = read.value;

    const witness = Option.filter(
      Option.fromNullishOr(rows[checkpoint.completed - 1]),
      (row) => identityOf(row) === checkpoint.lastIdentity,
    );
    const usable =
      checkpoint.fingerprint === MODEL_FINGERPRINT &&
      checkpoint.dimensions === DIMENSIONS &&
      checkpoint.completed > 0 &&
      checkpoint.completed <= rows.length &&
      Option.isSome(witness);
    if (!usable) {
      yield* Console.error(`  checkpoint at ${checkpointPath(out)} does not match — starting over`);
      return yield* fresh;
    }

    const stat = yield* fs.stat(partPath(out)).pipe(Effect.option);
    const wanted = BigInt(checkpoint.completed * DIMENSIONS);
    if (Option.isNone(stat) || stat.value.size < wanted) return yield* fresh;
    if (stat.value.size > wanted) {
      yield* fs
        .truncate(partPath(out), Number(wanted))
        .pipe(
          Effect.catch((error) =>
            Console.error(
              `  could not cut the unaccounted tail of ${partPath(out)} (${error.message}) — starting over`,
            ),
          ),
        );
      const repaired = yield* fs.stat(partPath(out)).pipe(Effect.option);
      const exact = Option.filter(repaired, (info) => info.size === wanted);
      if (Option.isNone(exact)) return yield* fresh;
    }
    yield* Console.error(
      `  resuming at ${String(checkpoint.completed)}/${String(rows.length)} from ${partPath(out)}`,
    );
    return checkpoint.completed;
  });

const reportProgress = (input: {
  readonly startedAt: number;
  readonly startRow: number;
  readonly done: number;
  readonly total: number;
}): Effect.Effect<void> =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const elapsedSeconds = Math.max((now - input.startedAt) / 1000, 0.001);
    const ratePerSecond = (input.done - input.startRow) / elapsedSeconds;
    const remaining = input.total - input.done;
    const percent = ((input.done / input.total) * 100).toFixed(1);
    const etaSeconds = remaining / Math.max(ratePerSecond, 0.001);
    const etaHours = Math.floor(etaSeconds / 3600);
    const etaMinutes = Math.floor((etaSeconds % 3600) / 60);
    yield* Console.error(
      `  … ${String(input.done)}/${String(input.total)} (${percent}%) · ` +
        `${ratePerSecond.toFixed(1)}/s · ETA ${String(etaHours)}h${String(etaMinutes).padStart(2, '0')}m`,
    );
  });

export const embedAllResumable = (
  rows: readonly VectorSourceRow[],
  out: string,
): Effect.Effect<Int8Array, CompilerEmbedError, QueryEmbedder | FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const embedder = yield* QueryEmbedder;
    const start = yield* resumePoint(rows, out);

    const flush = (batch: readonly Int8Array[], completed: number) =>
      Effect.gen(function* () {
        const bytes = new Uint8Array(batch.length * DIMENSIONS);
        for (const [index, vector] of batch.entries()) bytes.set(vector, index * DIMENSIONS);
        const file = yield* fs.open(partPath(out), { flag: 'a' });
        yield* file.writeAll(bytes);
        const last = Option.fromNullishOr(rows[completed - 1]);
        if (Option.isSome(last)) {
          const encoded = yield* encodeCheckpoint(
            VectorCheckpoint.make({
              fingerprint: MODEL_FINGERPRINT,
              dimensions: DIMENSIONS,
              completed,
              lastIdentity: identityOf(last.value),
            }),
          ).pipe(Effect.orDie);
          yield* fs.writeFileString(checkpointPath(out), encoded);
        }
      }).pipe(
        Effect.scoped,
        Effect.mapError((cause) =>
          CompilerEmbedError.make({ message: `checkpoint flush failed: ${String(cause)}` }),
        ),
      );

    const startedAt = yield* Clock.currentTimeMillis;
    let batch: Int8Array[] = [];
    for (let index = start; index < rows.length; index += 1) {
      const row = Option.fromNullishOr(rows[index]);
      if (Option.isNone(row)) break;
      const vector = yield* embedder.embedDocument(row.value.text).pipe(
        Effect.mapError((cause) =>
          CompilerEmbedError.make({
            message: `${MODEL_FINGERPRINT} unavailable (${cause.adapter}): ${cause.reason}`,
          }),
        ),
      );
      batch.push(vector);
      const done = index + 1;
      if (batch.length === FLUSH_EVERY || done === rows.length) {
        yield* flush(batch, done);
        batch = [];
        yield* reportProgress({ startedAt, startRow: start, done, total: rows.length });
      }
    }

    const bytes = yield* fs
      .readFile(partPath(out))
      .pipe(
        Effect.mapError((cause) =>
          CompilerEmbedError.make({ message: `part file unreadable: ${String(cause)}` }),
        ),
      );
    if (bytes.length !== rows.length * DIMENSIONS) {
      return yield* CompilerEmbedError.make({
        message: `part file carries ${String(bytes.length)} bytes, expected ${String(rows.length * DIMENSIONS)}`,
      });
    }
    return new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length);
  });

export const clearCheckpoint = (out: string): Effect.Effect<void, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.remove(partPath(out)).pipe(Effect.ignore);
    yield* fs.remove(checkpointPath(out)).pipe(Effect.ignore);
  });
