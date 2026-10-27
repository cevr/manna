// `film concept trace <spec.ts> [--view <name> ...] [--check]`: a kept sheet's
// views traced into the tables a rig is composed from (`core/trace.ts`). The
// spec (a module exporting `TRACE`, a `TraceSheet`) names the member, its
// kept sheet, its colour classes and, per view, its parts by their labels
// (`core/label.ts`) or their seeds; each view's table is written beside the
// spec, its header naming the sheet, the view's box and this command, so a
// critique's fix is traced again by running it once more. With `--check` it
// writes nothing: each view's table on disk is held to what it traces, the
// formatter's spacing aside, and any that differs fails it. A spec that names
// no view of that name, or a view the sheet cannot be read by, is refused.

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

/** The region each label picked, in a line: ` labels=face:#72 skin 11241px,…`; nothing for a view picked by seeds alone. */
const labelledLine = (t: Traced) =>
  Arr.match(Object.entries(t.labelled), {
    onEmpty: () => '',
    onNonEmpty: (picks) =>
      ` labels=${picks.map(([label, r]) => `${label}:#${r.id} ${r.class} ${r.size}px`).join(',')}`,
  });

/** A table's text as the formatter that runs on a commit cannot change it: its whitespace, its semicolons and its trailing commas gone (it wraps a type over lines, ending each member with one, and closes a wrapped list with one). */
const unspaced = (text: string) =>
  text
    .replace(/\s+/g, '')
    .replace(/;/g, '')
    .replace(/,(?=[\]}])/g, '');

/** Where table `traced` first parts from table `kept` as the formatter leaves it: none when they hold the same, else the 40 characters of each from there. */
const firstChange = (kept: string, traced: string): Option.Option<string> => {
  const [a, b] = [unspaced(kept), unspaced(traced)];
  const at = Arr.findFirstIndex(Arr.fromIterable(b), (c, i) => c !== a[i]);
  const end = Option.orElse(at, () =>
    Option.some(b.length).pipe(Option.filter(() => a.length !== b.length)),
  );
  return Option.map(end, (i) => `kept "${a.slice(i, i + 40)}", traced "${b.slice(i, i + 40)}"`);
};

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
    check: Flag.Boolean('check').pipe(
      Flag.withDescription(
        'write nothing: trace each view and say whether its table on disk is what it traces, failing on any that is not',
      ),
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
    const stale: string[] = [];
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
      const table = tracedModule(header, view, traced);
      const picks = labelledLine(traced);
      if (input.check) {
        const kept = yield* fs.readFileString(out).pipe(Effect.orElseSucceed(() => ''));
        const change = firstChange(kept, table);
        if (Option.isSome(change)) stale.push(name);
        yield* Console.log(
          `${Option.match(change, { onNone: () => 'same', onSome: (c) => `differs (${c})` })} ${spec.member} ${name}: ${out}${picks}`,
        );
        continue;
      }
      yield* fs.writeFileString(out, table);
      yield* Console.log(`traced ${spec.member} ${name}: ${out} ${counted(traced)}${picks}`);
    }
    if (stale.length > 0)
      return yield* TraceUnread.make({
        spec: file,
        reason: `its tables differ from what it traces: ${stale.join(', ')}`,
      });
  }),
).pipe(
  Command.withDescription(
    "Trace a kept cast sheet's views into the tables a rig is composed from: each view's parts by the spec's seeds, clipped where the sheet parts them by colour alone; each table written beside the spec, naming this command",
  ),
);
