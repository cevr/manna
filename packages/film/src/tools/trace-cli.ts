// `film concept trace <spec.ts> [--view <name> ...]`: a kept sheet's views
// traced into the tables a rig is composed from (`core/trace.ts`). The spec
// (a module exporting `TRACE`, a `TraceSheet`) names the member, its kept
// sheet, its colour classes and, per view, its parts by their seeds; each
// view's table is written beside the spec, its header naming the sheet, the
// view's box and this command, so a critique's fix is traced again by
// running it once more. A spec that names no view of that name, or a view
// the sheet cannot be read by, is refused.

import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import { Array as Arr, Console, Effect, FileSystem, Option, Path, Predicate, Schema } from 'effect';
import { type TraceSheet, type Traced, traceView, tracedModule } from '../core/trace.ts';
import { importFilmModule } from './film-repo.ts';
import { decodePng } from './png.ts';

/** A spec that exports no `TRACE`, or names no view asked for, or a view the sheet cannot be read by. */
class TraceUnread extends Schema.TaggedError<TraceUnread>()('TraceUnread', {
  spec: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the trace spec ${this.spec} does not read: ${this.reason}`;
  }
}

/** Whether `u` is a trace spec: a record with its member, its sheet and its views. */
const isSheet = (u: unknown): u is TraceSheet =>
  Predicate.isObject(u) &&
  Predicate.hasProperty(u, 'views') &&
  Predicate.hasProperty(u, 'sheet') &&
  Predicate.hasProperty(u, 'member');

/** A trace spec's module: its `TRACE`. */
const TraceModule = Schema.Struct({ TRACE: Schema.declare(isSheet) });

/** The spec module's `TRACE`, read from its path. */
const specAt = Effect.fn('Trace.spec')(function* (file: string) {
  const loaded: unknown = yield* Effect.tryPromise({
    try: () => importFilmModule(file),
    catch: (e) => TraceUnread.make({ spec: file, reason: String(e) }),
  });
  const m = yield* Schema.decodeUnknownEffect(TraceModule)(loaded).pipe(
    Effect.mapError(() =>
      TraceUnread.make({
        spec: file,
        reason: 'it exports no TRACE with a member, a sheet and views',
      }),
    ),
  );
  return m.TRACE;
});

/** What a traced view holds, in a line. */
const counted = (t: Traced) =>
  `outlines=${Object.keys(t.outlines).length} tones=${Object.keys(t.tones).length} circles=${Object.keys(t.circles).length} marks=${Option.isSome(Option.fromUndefinedOr(t.marks))}`;

export const trace = Command.make(
  'trace',
  {
    spec: Argument.String('spec').pipe(
      Argument.withDescription(
        'the trace spec, a module exporting TRACE (its sheet, classes and views)',
      ),
    ),
    view: Flag.String('view').pipe(
      Flag.atLeast(0),
      Flag.withDescription('a view to trace (every view of the spec unless named)'),
    ),
  },
  Effect.fn('film.concept.trace')(function* (input) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.resolve(input.spec);
    const spec = yield* specAt(file);
    const dir = path.dirname(file);
    const names = Arr.match(input.view, {
      onEmpty: () => Object.keys(spec.views),
      onNonEmpty: (v) => v,
    });
    const sheetFile = path.resolve(dir, spec.sheet);
    const sheet = yield* Effect.fromResult(decodePng(yield* fs.readFile(sheetFile)));
    for (const name of names) {
      const view = yield* Effect.fromOption(Option.fromUndefinedOr(spec.views[name])).pipe(
        Effect.mapError(() =>
          TraceUnread.make({
            spec: file,
            reason: `it names no view ${name}; it names ${Object.keys(spec.views).join(', ')}`,
          }),
        ),
      );
      const traced = yield* Effect.fromResult(traceView(sheet, view)).pipe(
        Effect.mapError((e) => TraceUnread.make({ spec: file, reason: `${name}: ${e.reason}` })),
      );
      const out = path.resolve(dir, view.out);
      const header = [
        `${spec.member}, ${view.about}, traced from the kept ${spec.kind} sheet`,
        `(${path.relative(dir, sheetFile)}, box ${view.box.join(', ')}) in the sheet's own pixels.`,
        `Written by \`bun run concept trace ${path.relative(path.resolve('.'), file)} --view ${name}\``,
        `(from apps/animations); trace it again rather than edit it. Points only: the`,
        `film's papers paint each part. Pure.`,
      ];
      yield* fs.writeFileString(out, tracedModule(header, view, traced));
      yield* Console.log(`traced ${spec.member} ${name}: ${out} ${counted(traced)}`);
    }
  }),
).pipe(
  Command.withDescription(
    "Trace a kept cast sheet's views into the tables a rig is composed from: each view's parts by the spec's seeds, clipped where the sheet parts them by colour alone; each table written beside the spec, naming this command",
  ),
);
