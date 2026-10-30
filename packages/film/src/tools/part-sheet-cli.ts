// `film concept parts <film> <member> --view <kind>-<view> [--dry-run]
// [--reuse] [--check]`: a kept view's part sheet, its hidden areas painted.
// The view is cut by the member's cut table (`<member>/cutout/cut.ts`:
// `CUTS`, `cutOptionsFor`, `HIDDEN`; `core/part-sheet.ts`). Every moving
// part's area is painted flat magenta on the whole view, padded to the image
// route's portrait, and okra repaints the magenta alone on its Codex route
// (the subscription; never `--model`, the paid API). Each answer is laid
// and measured (`part-sheet-lay.ts`), and the best is kept: the part PNGs,
// the sheet laid out and its tint of the painted pixels, and `record.json`,
// under `<member>/cutout/sheets/<view>/`; each call's input (named by its
// bytes' hash), the prompt and the answers under its `okra/`.
//
// A view takes three calls in all, and more only by an allowance its cut
// table records (`HIDDEN[view].allowance`: how many, who granted them, when
// and why). Every call is written to the view's ledger (`okra/calls.json`)
// before the route is asked, so a call whose answer then fails to arrive,
// decode or lay still counts; an answer file the ledger lacks counts too.
// An answer drawn from another input (the cut has moved since) is stale:
// kept in the record, never laid, and still counted. `--reuse` lays the
// answers already drawn; `--check` lays them, writes nothing and fails
// where a file differs; `--dry-run` writes the magenta input under
// `out/<film>/cast/<member>/parts/<view>/`. None of the three calls okra.

import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import {
  Array as Arr,
  Boolean as Bool,
  Clock,
  Console,
  Effect,
  FileSystem,
  Option,
  Order,
  Path,
  Predicate,
  Result,
  Schema,
} from 'effect';
import { keptFile, SheetKind } from '../core/cast-sheet.ts';
import { type PartCut, type PartCutOptions, cutParts } from '../core/part-sheet.ts';
import { type Raster, cropRaster } from '../core/raster.ts';
import { padInto } from '../core/register.ts';
import { castFolder } from './cast-library.ts';
import { sha256Hex } from './digest.ts';
import { FilmFolder, filmNamed, importFilmModule } from './film-repo.ts';
import { ImageRoute, PORTRAIT, editRequest, okraCommand } from './image-route.ts';
import {
  BARS,
  HiddenMeasures,
  PartGrain,
  type Sheet,
  domainOf,
  groundOf,
  hiddenOf,
  layAnswer,
  magentaOf,
  missedBars,
  rankOf,
  sheetStrip,
} from './part-sheet-lay.ts';
import { decodePng, encodePng } from './png.ts';

/** A part sheet that cannot be made: the member's cut table, the view, the cut, the paint or the calls. */
class PartsUnmade extends Schema.TaggedError<PartsUnmade>()('PartsUnmade', {
  view: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the part sheet of ${this.view} cannot be made: ${this.reason}`;
  }
}

/** The okra calls a view takes in all, beside any allowance its cut table records. */
const MOST_CALLS = 3;

/** The view's ledger of calls, under its sheet's folder. */
const LEDGER = 'okra/calls.json';

/** An answer file the route writes, under `okra/`. */
const ANSWER_FILE = /^answer-(\d+)\.png$/;

/** More calls a view's cut table grants it: how many, who granted them, on which day and why. */
const Allowance = Schema.Struct({
  calls: Schema.Int,
  by: Schema.String,
  on: Schema.String,
  why: Schema.String,
});

/** A part's grain miss accepted by name: the part, who accepted it, when and why. */
const NamedMiss = Schema.Struct({
  bar: Schema.Literal('grain'),
  part: Schema.String,
  by: Schema.String,
  on: Schema.String,
  why: Schema.String,
});

/** A view's entry in its member's `HIDDEN`: its moving parts, okra's words, any allowance of calls, and any miss accepted by name. */
export interface HiddenEntry {
  readonly moving: ReadonlyArray<string>;
  readonly prompt: string;
  readonly allowance?: typeof Allowance.Type;
  readonly named?: ReadonlyArray<typeof NamedMiss.Type>;
}

/** The named misses the kept answer holds, each with its part's grain both sides: a named part read within its bar holds no miss. */
const namedOf = (hidden: HiddenEntry, measures: HiddenMeasures) =>
  (hidden.named ?? []).flatMap((miss) =>
    measures.grain
      .filter((g) => g.part === miss.part && g.verdict === 'outside')
      .map((g) => ({ ...miss, grain: g })),
  );

/** What a member's cut table exports: its cuts, each view's options, each view's hidden entry. */
interface CutModule {
  readonly CUTS: Readonly<Record<string, PartCut>>;
  readonly cutOptionsFor: (view: string, raster: Raster) => PartCutOptions;
  readonly HIDDEN: Readonly<Record<string, HiddenEntry>>;
  /** Each view's frame on its kept sheet, where its part sheet is cut from the kept box padded: the sheet, the kept box and the pad (left, top, right, bottom). A view with none is cut from its kept view (`views/<view>.png`). */
  readonly FRAMES?: Readonly<Record<string, ViewFrame>>;
}

/** A view's frame on its kept sheet (`kept/<sheet>.png`): its kept box and the pixels its part sheet pads it by. */
interface ViewFrame {
  readonly sheet: string;
  readonly kept: readonly [number, number, number, number];
  readonly pad: readonly [number, number, number, number];
}

const isCutModule = (u: unknown): u is CutModule =>
  Predicate.isObject(u) &&
  Predicate.hasProperty(u, 'CUTS') &&
  Predicate.hasProperty(u, 'HIDDEN') &&
  Predicate.hasProperty(u, 'cutOptionsFor') &&
  Predicate.isFunction(u.cutOptionsFor);

const Similarity = Schema.Struct({ s: Schema.Finite, dx: Schema.Finite, dy: Schema.Finite });

/** One call of a view, as its ledger keeps it: its number, its command line and its input and answer (paths from the sheet's folder; the input named by its bytes' hash). */
const CallEntry = Schema.Struct({
  n: Schema.Int,
  command: Schema.Array(Schema.String),
  input: Schema.String,
  out: Schema.String,
});
type CallEntry = typeof CallEntry.Type;

const LedgerJson = Schema.fromJsonString(Schema.Struct({ calls: Schema.Array(CallEntry) }), {
  space: 2,
});

/** A call as the record keeps it after a lay: laid (its fit and measures with it), stale (drawn from another input), or failed (its answer did not arrive, decode or lay; why). */
const CallLaid = Schema.Struct({
  ...CallEntry.fields,
  state: Schema.Literals(['laid', 'stale', 'failed']),
  reason: Schema.optional(Schema.String),
  fit: Schema.optional(Schema.Struct({ ...Similarity.fields, score: Schema.Finite })),
  measures: Schema.optional(HiddenMeasures),
  missed: Schema.optional(Schema.Array(Schema.String)),
});
type CallLaid = typeof CallLaid.Type;

/** A view's part sheet record: its parts, its moving parts, its okra calls, budget and the answer kept, its measures and bars. */
const PartSheetRecord = Schema.Struct({
  view: Schema.String,
  kind: Schema.String,
  size: Schema.Array(Schema.Int),
  /** The part sheet's frame on the kept sheet, sheet px (`[x0, y0, x1, y1]`): its kept box padded, where the cut table pads it. */
  box: Schema.optional(Schema.Array(Schema.Int)),
  command: Schema.String,
  parts: Schema.Array(
    Schema.Struct({ name: Schema.String, kept: Schema.Int, painted: Schema.Int }),
  ),
  moving: Schema.Array(Schema.String),
  hiddenPx: Schema.Int,
  /** Areas painted by the sheet's own rows carried under, not okra: none. */
  carried: Schema.Array(Schema.String),
  okra: Schema.Struct({
    route: Schema.String,
    input: Schema.String,
    prompt: Schema.String,
    pad: Similarity,
    budget: Schema.Struct({
      calls: Schema.Int,
      allowance: Schema.NullOr(Allowance),
      used: Schema.Int,
    }),
    calls: Schema.Array(CallLaid),
    chosen: Schema.Int,
    fit: Schema.Struct({ ...Similarity.fields, score: Schema.Finite }),
  }),
  measures: HiddenMeasures,
  bars: Schema.Struct({
    seamDeltaE: Schema.Finite,
    driftDeltaE: Schema.Finite,
    grainWithin: Schema.Finite,
    visibleAtRest: Schema.Int,
    leastSeamPairs: Schema.Int,
    leastGrainWindows: Schema.Int,
  }),
  missed: Schema.Array(Schema.String),
  /** The misses its cut table accepts by name, each with its numbers. */
  named: Schema.Array(Schema.Struct({ ...NamedMiss.fields, grain: PartGrain })),
});
const PartSheetRecordJson = Schema.fromJsonString(PartSheetRecord, { space: 2 });

/** `<kind>-<view>` read: the kind, and the view's name in the member's views. */
const viewOf = (asked: string) =>
  Arr.findFirst(SheetKind.literals, (k) => asked.startsWith(`${k}-`)).pipe(
    Result.fromOption(() =>
      PartsUnmade.make({
        view: asked,
        reason: 'a view is <kind>-<view>, its kind turnaround, poses or heads',
      }),
    ),
    Result.map((kind) => ({ kind, name: asked.slice(kind.length + 1) })),
  );

/** A PNG read, or why not. */
const pngAt = (file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const bytes = yield* fs.readFile(file).pipe(Effect.mapError((e) => e.message));
    return yield* Effect.fromResult(Result.mapError(decodePng(bytes), (e) => e.message));
  });

/** The member's cut table, its view's cut and its hidden entry, or why not. */
const cutTableOf = (file: string, name: string, refuse: (reason: string) => PartsUnmade) =>
  Effect.gen(function* () {
    const loaded: unknown = yield* Effect.tryPromise({
      try: () => importFilmModule(file),
      catch: (e) => refuse(`${file} does not load: ${String(e)}`),
    });
    if (!isCutModule(loaded))
      return yield* refuse(`${file} exports no CUTS, cutOptionsFor and HIDDEN`);
    const found = Option.all([
      Option.fromUndefinedOr(loaded.CUTS[name]),
      Option.fromUndefinedOr(loaded.HIDDEN[name]),
    ]);
    return yield* Option.match(found, {
      onNone: () => refuse(`the cut table has no cut and HIDDEN entry for ${name}`),
      onSome: ([cut, hidden]) =>
        Effect.succeed({
          cut,
          hidden,
          optionsFor: loaded.cutOptionsFor,
          frame: Option.fromUndefinedOr(loaded.FRAMES?.[name]),
        }),
    });
  });

/** The magenta input a view's sheet asks okra to repaint, padded to `portrait`, and what laying an answer back reads. */
const inputOf = (
  view: Raster,
  sheet: Sheet,
  moving: ReadonlyArray<string>,
  portrait: { readonly width: number; readonly height: number },
) => {
  const hidden = hiddenOf(sheet, moving);
  const ground = groundOf(view);
  const pad = padInto(magentaOf(view, hidden), portrait.width, portrait.height, ground);
  return { hidden, ground, pad, bytes: encodePng(pad.picture) };
};

/** One run of a view's part sheet: what it is called, the view cut, its hidden entry, its folder, and whether it calls okra, lays again or checks. */
interface PartsJob {
  readonly label: string;
  readonly command: string;
  readonly kind: string;
  readonly name: string;
  readonly view: Raster;
  readonly sheet: Sheet;
  readonly hidden: HiddenEntry;
  readonly dir: string;
  readonly mode: 'call' | 'reuse' | 'check';
  readonly portrait: { readonly width: number; readonly height: number };
  /**
   * Where the kept box lies in a padded view (its left and top, and its
   * size), and the padded frame's box on the kept sheet: okra is asked, and
   * its answer laid, on the kept box alone, so an answer drawn for the kept
   * view lays on its padded part sheet, and the paint is laid into the
   * padded sheet there.
   */
  readonly frame: Option.Option<{
    readonly at: readonly [number, number];
    readonly size: readonly [number, number];
    readonly box: readonly [number, number, number, number];
  }>;
}

/** `sheet` cut to the box at `at` of `size`: each part's pixels and the owners there. */
const cropSheet = (
  sheet: Sheet,
  at: readonly [number, number],
  size: readonly [number, number],
): Sheet => {
  const box = [at[0], at[1], at[0] + size[0], at[1] + size[1]] as const;
  const owner = new Uint8Array(size[0] * size[1]);
  for (let y = 0; y < size[1]; y++)
    owner.set(
      sheet.owner.subarray((at[1] + y) * sheet.width + at[0], (at[1] + y) * sheet.width + box[2]),
      y * size[0],
    );
  return {
    width: size[0],
    height: size[1],
    owner,
    parts: sheet.parts.map((p) => ({ ...p, pixels: cropRaster(p.pixels, box) })),
  };
};

/**
 * An answer's fit as the record keeps it: answer px to the part sheet's px.
 * It is laid on the kept box alone, so a padded sheet's fit is moved by
 * where the kept box lies in it.
 */
const inSheet = <F extends { readonly dx: number; readonly dy: number }>(
  fit: F,
  frame: PartsJob['frame'],
): F =>
  Option.match(frame, {
    onNone: () => fit,
    onSome: (f) => ({ ...fit, dx: fit.dx + f.at[0], dy: fit.dy + f.at[1] }),
  });

/** What okra is asked on, and its answer laid on: a padded view's kept box alone, else the whole view. */
const askedOf = (view: Raster, sheet: Sheet, frame: PartsJob['frame']) =>
  Option.match(frame, {
    onNone: () => ({ view, sheet }),
    onSome: (f) => ({
      view: cropRaster(view, [f.at[0], f.at[1], f.at[0] + f.size[0], f.at[1] + f.size[1]]),
      sheet: cropSheet(sheet, f.at, f.size),
    }),
  });

/** `whole`'s parts with `inner`'s (a sheet cut from it at `at`, its paint laid, its parts in the same order) laid back at `at`, and each part's painted pixels counted again. */
const laidInto = (whole: Sheet, inner: Sheet, at: readonly [number, number]): Sheet => ({
  ...whole,
  parts: Arr.zipWith(whole.parts, inner.parts, (p, q) => {
    const rgba = Uint8Array.from(p.pixels.rgba);
    const from = q.pixels;
    for (let y = 0; y < from.height; y++)
      rgba.set(
        from.rgba.subarray(y * from.width * 4, (y + 1) * from.width * 4),
        ((at[1] + y) * whole.width + at[0]) * 4,
      );
    const k = whole.parts.indexOf(p) + 1;
    let painted = 0;
    for (let i = 0; i < whole.owner.length; i++)
      if (Number(rgba[i * 4 + 3]) > 0 && whole.owner[i] !== k) painted++;
    return { ...p, pixels: { width: whole.width, height: whole.height, rgba }, painted };
  }),
});

/** The view's ledger of calls (none before its first); how many it has used: each ledger entry, and each answer file under `okra/` the ledger lacks; and the next unused call number. */
const ledgerOf = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.join(dir, LEDGER);
    const calls: ReadonlyArray<CallEntry> = yield* Bool.match(yield* fs.exists(file), {
      onTrue: () =>
        fs.readFileString(file).pipe(
          Effect.flatMap(Schema.decodeEffect(LedgerJson)),
          Effect.map((l) => l.calls),
        ),
      onFalse: () => Effect.succeed<ReadonlyArray<CallEntry>>([]),
    });
    const okra = path.join(dir, 'okra');
    const answers: ReadonlyArray<string> = yield* Bool.match(yield* fs.exists(okra), {
      onTrue: () => fs.readDirectory(okra),
      onFalse: () => Effect.succeed<ReadonlyArray<string>>([]),
    });
    // an answer file the ledger does not list is an attempt it lost: it counts on its own
    const listed = new Set(calls.map((c) => path.basename(c.out)));
    const orphans = answers.filter((f) => ANSWER_FILE.test(f) && !listed.has(f));
    return {
      calls,
      used: calls.length + orphans.length,
      next: Math.max(0, ...calls.map((c) => c.n), ...orphans.map(numberOf)) + 1,
    };
  });

/** An answer file's call number. */
const numberOf = (file: string) => Number(ANSWER_FILE.exec(file)?.[1] ?? 0);

/** A laid call's line: its measures, or its state and why. */
const callLine = (label: string, c: CallLaid) =>
  Option.match(Option.fromUndefinedOr(c.measures), {
    onNone: () =>
      `parts ${label} answer ${c.n}: ${[c.state, ...Option.toArray(Option.fromUndefinedOr(c.reason))].join(' ')}`,
    onSome: (m) =>
      `parts ${label} answer ${c.n}: seam=${Option.getOrElse(Option.map(m.seam.deltaE, String), () => 'unread')}/${m.seam.pairs} drift=${m.drift.deltaE} grain=${m.grain.map((g) => `${g.part}:${g.painted.robust}/${g.kept.robust}:${g.verdict}`).join(',')} painted=${m.paintedPx}px visible=${m.visibleAtRest} missed=${(c.missed ?? []).join(',') || 'none'}`,
  });

/**
 * A view's part sheet made, laid again or checked. With `call`, one more
 * okra call is written to the ledger and then asked, refused once the view
 * has used its budget. Every call on the present input is laid; the best
 * (`rankOf`) is kept.
 */
export const runParts = Effect.fn('film.concept.parts.run')(function* (job: PartsJob) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const refuse = (reason: string) => PartsUnmade.make({ view: `${job.kind}-${job.name}`, reason });
  const { dir, label } = job;
  const { view, sheet } = askedOf(job.view, job.sheet, job.frame);
  const made = inputOf(view, sheet, job.hidden.moving, job.portrait);
  // the input named by its bytes, so an answer is laid only on the cut it was drawn for
  const inputName = `okra/input-${sha256Hex(made.bytes).slice(0, 12)}.png`;
  const allowance = Option.fromUndefinedOr(job.hidden.allowance);
  const budget = MOST_CALLS + Option.match(allowance, { onNone: () => 0, onSome: (a) => a.calls });
  const prior = yield* ledgerOf(dir).pipe(
    Effect.mapError((e) => refuse(`its ledger does not read: ${String(e)}`)),
  );
  const relative = (arg: string) => arg.split(`${dir}${path.sep}`).join('');
  const calls: CallEntry[] = [...prior.calls];
  let used = prior.used;
  if (job.mode === 'call') {
    if (used >= budget)
      return yield* refuse(
        `it has used ${used} okra calls of its ${budget} (${MOST_CALLS} and an allowance of ${budget - MOST_CALLS}); --reuse lays them again`,
      );
    yield* fs.makeDirectory(path.join(dir, 'okra'), { recursive: true });
    yield* fs.writeFile(path.join(dir, inputName), made.bytes);
    const n = prior.next;
    const out = path.join(dir, 'okra', `answer-${n}.png`);
    const request = editRequest(job.hidden.prompt, path.join(dir, inputName), out);
    calls.push({
      n,
      command: okraCommand(request).map(relative),
      input: inputName,
      out: relative(out),
    });
    used += 1;
    // the call is in the ledger before the route is asked: it counts whatever follows
    const ledger = yield* Schema.encodeEffect(LedgerJson)({ calls });
    yield* fs.writeFileString(path.join(dir, LEDGER), `${ledger}\n`);
    yield* Console.log(`parts ${label} okra call ${n}: ${calls.at(-1)?.command.join(' ')}`);
    yield* (yield* ImageRoute).draw(request).pipe(Effect.mapError((e) => refuse(e.message)));
  }
  const target = {
    view,
    sheet,
    hidden: made.hidden,
    domain: domainOf(sheet, made.hidden),
    moving: job.hidden.moving,
    pad: made.pad.fit,
    portrait: job.portrait,
  };
  const laid = yield* Effect.forEach(calls, (call) =>
    Bool.match(call.input === inputName, {
      onFalse: () => Effect.succeed({ call, at: Result.fail('stale') }),
      onTrue: () =>
        pngAt(path.join(dir, call.out)).pipe(
          Effect.flatMap((answer) =>
            Effect.fromResult(Result.mapError(layAnswer(target, answer), (e) => e.message)),
          ),
          Effect.result,
          Effect.map((at) => ({ call, at })),
        ),
    }),
  );
  const records: ReadonlyArray<CallLaid> = laid.map(({ call, at }) =>
    Result.match(at, {
      onFailure: (reason) =>
        Bool.match(reason === 'stale', {
          onTrue: () => ({ ...call, state: 'stale' as const }),
          onFalse: () => ({ ...call, state: 'failed' as const, reason }),
        }),
      onSuccess: (l) => ({
        ...call,
        state: 'laid' as const,
        fit: inSheet(l.fit, job.frame),
        measures: l.measures,
        missed: missedBars(l.measures),
      }),
    }),
  );
  for (const c of records.filter((r) => r.state !== 'stale'))
    yield* Console.log(callLine(label, c));
  const tried = laid.flatMap(({ call, at }) =>
    Result.match(at, { onFailure: () => [], onSuccess: (l) => [{ call, ...l }] }),
  );
  const byRank = Order.mapInput(
    Order.Tuple([Order.Number, Order.Number, Order.Number]),
    (t: (typeof tried)[number]) => rankOf(t.measures),
  );
  // the best answer by rank, the first drawn on a tie
  const found = Arr.reduce(tried, Option.none<(typeof tried)[number]>(), (best, t) =>
    Option.match(best, {
      onNone: () => Option.some(t),
      onSome: (b) => Option.some([b, t][Number(byRank(t, b) < 0)] ?? b),
    }),
  );
  if (Option.isNone(found))
    return yield* refuse(
      `no okra answer on its present input lays (${calls.length} calls, ${budget - used} left of ${budget}); run it without --reuse`,
    );
  const best = found.value;
  // the paint laid on the kept box, laid back into the padded sheet
  const whole = Option.match(job.frame, {
    onNone: () => best.made,
    onSome: (f) => laidInto(job.sheet, best.made, f.at),
  });
  const record: typeof PartSheetRecord.Type = {
    view: job.name,
    kind: job.kind,
    size: [job.view.width, job.view.height],
    ...Option.match(job.frame, {
      onNone: () => ({}),
      onSome: (f) => ({ box: [...f.box] }),
    }),
    command: job.command,
    parts: whole.parts.map((p) => ({ name: p.name, kept: p.kept, painted: p.painted })),
    moving: job.hidden.moving,
    hiddenPx: made.hidden.reduce((a, b) => a + b, 0),
    carried: [],
    okra: {
      route: 'subscription (okra image, Codex route; no --model)',
      input: inputName,
      prompt: 'okra/prompt.txt',
      pad: made.pad.fit,
      budget: { calls: budget, allowance: Option.getOrNull(allowance), used },
      calls: records,
      chosen: best.call.n,
      fit: inSheet(best.fit, job.frame),
    },
    measures: best.measures,
    bars: BARS,
    missed: missedBars(best.measures),
    named: namedOf(job.hidden, best.measures),
  };
  const recordText = yield* Schema.encodeEffect(PartSheetRecordJson)(record).pipe(
    Effect.mapError((e) => refuse(e.message)),
  );
  const files: ReadonlyArray<readonly [string, Uint8Array]> = [
    ...whole.parts.map((p) => [`${p.name}.png`, encodePng(p.pixels)] as const),
    ['sheet.png', encodePng(sheetStrip(whole, made.ground, false))],
    ['sheet-painted.png', encodePng(sheetStrip(whole, made.ground, true))],
    [inputName, made.bytes],
    ['okra/prompt.txt', new TextEncoder().encode(`${job.hidden.prompt}\n`)],
    ['record.json', new TextEncoder().encode(`${recordText}\n`)],
  ];
  if (job.mode === 'check') {
    // the record is held as its formatter leaves it, so it is read and written again before it is compared
    const held = (file: string): Effect.Effect<Uint8Array, unknown> =>
      Bool.match(file === 'record.json', {
        onTrue: () =>
          fs.readFileString(path.join(dir, file)).pipe(
            Effect.flatMap(Schema.decodeEffect(PartSheetRecordJson)),
            Effect.flatMap(Schema.encodeEffect(PartSheetRecordJson)),
            Effect.map((text) => new TextEncoder().encode(`${text}\n`)),
          ),
        onFalse: () => fs.readFile(path.join(dir, file)),
      });
    const differs = yield* Effect.filter(files, ([file, bytes]) =>
      held(file).pipe(
        Effect.map((h) => h.length !== bytes.length || h.some((b, i) => b !== bytes[i])),
        Effect.orElseSucceed(() => true),
      ),
    );
    if (differs.length > 0)
      return yield* refuse(`${differs.map(([f]) => f).join(', ')} differ from what it lays`);
    yield* Console.log(
      `parts ${label} check: ${files.length} files hold, answer ${best.call.n} kept okra=0`,
    );
    return record;
  }
  yield* fs.makeDirectory(path.join(dir, 'okra'), { recursive: true });
  for (const [file, bytes] of files) yield* fs.writeFile(path.join(dir, file), bytes);
  yield* Console.log(
    `parts ${label} kept answer ${best.call.n} missed=${record.missed.join(',') || 'none'} parts=${best.made.parts.length} dir=${dir} okra=${used - prior.used}`,
  );
  return record;
});

export const parts = Command.make(
  'parts',
  {
    film: Argument.String('film').pipe(Argument.withDescription('the film whose cast holds him')),
    member: Argument.String('member').pipe(Argument.withDescription('the cast member, by its id')),
    view: Flag.String('view').pipe(
      Flag.withDescription(
        'the kept view to cut and paint, <kind>-<view> (turnaround-front, heads-heads-4)',
      ),
    ),
    dryRun: Flag.Boolean('dry-run').pipe(
      Flag.withDefault(false),
      Flag.withDescription('write the magenta input under out/ and call nothing'),
    ),
    reuse: Flag.Boolean('reuse').pipe(
      Flag.withDefault(false),
      Flag.withDescription('lay the answers already drawn again, and call nothing'),
    ),
    check: Flag.Boolean('check').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        'lay the answers already drawn, write nothing, and fail where a file on disk differs from what it lays',
      ),
    ),
  },
  Effect.fn('film.concept.parts')(function* (input) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { kind, name } = yield* Effect.fromResult(viewOf(input.view));
    const refuse = (reason: string) => PartsUnmade.make({ view: input.view, reason });
    const film = yield* filmNamed(input.film);
    const folder = yield* castFolder(film, input.member);
    const memberDir = path.dirname(folder);
    const table = yield* cutTableOf(path.join(memberDir, 'cutout', 'cut.ts'), name, refuse);
    // a framed view is its kept sheet cut at the kept box padded; else the kept view
    const frame = Option.map(table.frame, (f) => {
      const box = [
        f.kept[0] - f.pad[0],
        f.kept[1] - f.pad[1],
        f.kept[2] + f.pad[2],
        f.kept[3] + f.pad[3],
      ] as const;
      return {
        sheet: f.sheet,
        box,
        at: [f.pad[0], f.pad[1]] as const,
        size: [f.kept[2] - f.kept[0], f.kept[3] - f.kept[1]] as const,
      };
    });
    const view = yield* Option.match(frame, {
      onNone: () => pngAt(path.join(folder, 'views', `${name}.png`)),
      onSome: (f) =>
        pngAt(
          path.join(
            folder,
            Option.match(Schema.decodeUnknownOption(SheetKind)(f.sheet), {
              onNone: () => `kept/${f.sheet}.png`,
              onSome: (k) => keptFile(k, name),
            }),
          ),
        ).pipe(Effect.map((sheet) => cropRaster(sheet, f.box))),
    }).pipe(Effect.mapError(refuse));
    const started = yield* Clock.currentTimeMillis;
    const sheet = yield* Effect.fromResult(
      Result.mapError(cutParts(view, table.cut, table.optionsFor(name, view)), (e) =>
        refuse(e.message),
      ),
    );
    const cutMs = (yield* Clock.currentTimeMillis) - started;
    const label = `${input.member}.${input.view}`;
    const framed = Option.map(frame, (f) => ({ at: f.at, size: f.size, box: f.box }));
    if (input.dryRun) {
      const asked = askedOf(view, sheet, framed);
      const made = inputOf(asked.view, asked.sheet, table.hidden.moving, PORTRAIT);
      const out = path.join(
        (yield* FilmFolder).paths(film).out,
        'cast',
        input.member,
        'parts',
        name,
      );
      yield* fs.makeDirectory(out, { recursive: true });
      const mask = path.join(out, 'input.png');
      yield* fs.writeFile(mask, made.bytes);
      return yield* Console.log(
        `parts ${label} dry-run parts=${sheet.parts.length} moving=${table.hidden.moving.join(',')} hidden=${made.hidden.reduce((a, b) => a + b, 0)}px cut=${cutMs}ms mask=${mask} okra=0`,
      );
    }
    const modes = [
      ['call', !input.reuse && !input.check],
      ['reuse', input.reuse && !input.check],
      ['check', input.check],
    ] as const;
    yield* runParts({
      label,
      command: `film concept parts ${input.film} ${input.member} --view ${input.view}`,
      kind,
      name,
      view,
      sheet,
      hidden: table.hidden,
      dir: path.join(memberDir, 'cutout', 'sheets', name),
      mode: modes.find(([, on]) => on)?.[0] ?? 'check',
      portrait: PORTRAIT,
      frame: framed,
    });
  }),
).pipe(
  Command.withDescription(
    "Cut a kept view into its part sheet and paint what its moving parts hide: okra (subscription route) repaints their magenta areas, each answer is laid back by one similarity fitted on colour and laid only under the parts in front, in their tone; the best answer of the view's budget of calls (three, and any allowance its cut table records) is kept with its seam, drift and grain under the member's cutout/sheets/<view>/",
  ),
  Command.provide(ImageRoute.layer),
);
