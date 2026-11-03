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
import {
  type PartCut,
  type PartCutOptions,
  type SheetClean,
  countedOf,
  cutParts,
} from '../core/part-sheet.ts';
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
  missesOf,
  rankOrder,
  sheetStrip,
} from './part-sheet-lay.ts';
import { decodePng, encodePng } from './png.ts';

class PartsUnmade extends Schema.TaggedError<PartsUnmade>()('PartsUnmade', {
  view: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the part sheet of ${this.view} cannot be made: ${this.reason}`;
  }
}

const MOST_CALLS = 3;

const LEDGER = 'okra/calls.json';

const ANSWER_FILE = /^answer-(\d+)\.png$/;

const Allowance = Schema.Struct({
  calls: Schema.Int,
  by: Schema.String,
  on: Schema.String,
  why: Schema.String,
});

const NamedMiss = Schema.Struct({
  bar: Schema.Literal('grain'),
  part: Schema.String,
  by: Schema.String,
  on: Schema.String,
  why: Schema.String,
});

export interface HiddenEntry {
  readonly moving: ReadonlyArray<string>;
  readonly prompt: string;
  readonly allowance?: typeof Allowance.Type;
  readonly named?: ReadonlyArray<typeof NamedMiss.Type>;
}

const namedOf = (hidden: HiddenEntry, measures: HiddenMeasures) =>
  (hidden.named ?? []).flatMap((miss) =>
    measures.grain
      .filter((g) => g.part === miss.part && g.verdict === 'outside')
      .map((g) => ({ ...miss, grain: g })),
  );

interface CutModule {
  readonly CUTS: Readonly<Record<string, PartCut>>;
  readonly cutOptionsFor: (view: string, raster: Raster) => PartCutOptions;
  readonly HIDDEN: Readonly<Record<string, HiddenEntry>>;
  readonly FRAMES?: Readonly<Record<string, ViewFrame>>;
  readonly paperOf: (view: string, raster: Raster) => EnclosedPaper;
  readonly CLEAN?: Readonly<Record<string, SheetClean>>;
}

interface PaperPiece {
  readonly box: readonly [number, number, number, number];
  readonly area: number;
}

interface EnclosedPaper {
  readonly held: ReadonlyArray<PaperPiece>;
  readonly open: ReadonlyArray<PaperPiece & { readonly why: string }>;
  readonly stale: ReadonlyArray<{
    readonly at: readonly [number, number];
    readonly box: PaperPiece['box'];
    readonly opened: ReadonlyArray<PaperPiece['box']>;
  }>;
}

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
  Predicate.isFunction(u.cutOptionsFor) &&
  Predicate.hasProperty(u, 'paperOf') &&
  Predicate.isFunction(u.paperOf);

const Similarity = Schema.Struct({ s: Schema.Finite, dx: Schema.Finite, dy: Schema.Finite });

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

const CallLaid = Schema.Struct({
  ...CallEntry.fields,
  state: Schema.Literals(['laid', 'stale', 'failed']),
  reason: Schema.optional(Schema.String),
  fit: Schema.optional(Schema.Struct({ ...Similarity.fields, score: Schema.Finite })),
  measures: Schema.optional(HiddenMeasures),
  missed: Schema.optional(Schema.Array(Schema.String)),
});
type CallLaid = typeof CallLaid.Type;

const PartSheetRecord = Schema.Struct({
  view: Schema.String,
  kind: Schema.String,
  size: Schema.Array(Schema.Int),
  box: Schema.optional(Schema.Array(Schema.Int)),
  command: Schema.String,
  parts: Schema.Array(
    Schema.Struct({ name: Schema.String, kept: Schema.Int, painted: Schema.Int }),
  ),
  moving: Schema.Array(Schema.String),
  hiddenPx: Schema.Int,
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
    chromaDrop: Schema.Finite,
    grainWithin: Schema.Finite,
    grainCellOver: Schema.Finite,
    speckOver: Schema.Finite,
    stepWithin: Schema.Finite,
    visibleAtRest: Schema.Int,
    leastSeamPairs: Schema.Int,
    leastStepPairs: Schema.Int,
    leastGrainWindows: Schema.Int,
    leastRegionPx: Schema.Int,
    leastCellPx: Schema.Int,
  }),
  missed: Schema.Array(Schema.String),
  named: Schema.Array(Schema.Struct({ ...NamedMiss.fields, grain: PartGrain })),
});
const PartSheetRecordJson = Schema.fromJsonString(PartSheetRecord, { space: 2 });

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

const pngAt = (file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const bytes = yield* fs.readFile(file).pipe(Effect.mapError((e) => e.message));
    return yield* Effect.fromResult(Result.mapError(decodePng(bytes), (e) => e.message));
  });

const cutTableOf = (file: string, name: string, refuse: (reason: string) => PartsUnmade) =>
  Effect.gen(function* () {
    const loaded: unknown = yield* Effect.tryPromise({
      try: () => importFilmModule(file),
      catch: (e) => refuse(`${file} does not load: ${String(e)}`),
    });
    if (!isCutModule(loaded))
      return yield* refuse(`${file} exports no CUTS, cutOptionsFor, HIDDEN and paperOf`);
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
          paperOf: loaded.paperOf,
          clean: Option.fromUndefinedOr(loaded.CLEAN?.[name]),
        }),
    });
  });

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

export interface PartsJob {
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
  readonly clean: Option.Option<SheetClean>;
  readonly frame: Option.Option<{
    readonly at: readonly [number, number];
    readonly size: readonly [number, number];
    readonly box: readonly [number, number, number, number];
  }>;
}

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

const inSheet = <F extends { readonly dx: number; readonly dy: number }>(
  fit: F,
  frame: PartsJob['frame'],
): F =>
  Option.match(frame, {
    onNone: () => fit,
    onSome: (f) => ({ ...fit, dx: fit.dx + f.at[0], dy: fit.dy + f.at[1] }),
  });

const askedOf = (view: Raster, sheet: Sheet, frame: PartsJob['frame']) =>
  Option.match(frame, {
    onNone: () => ({ view, sheet }),
    onSome: (f) => ({
      view: cropRaster(view, [f.at[0], f.at[1], f.at[0] + f.size[0], f.at[1] + f.size[1]]),
      sheet: cropSheet(sheet, f.at, f.size),
    }),
  });

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
    const listed = new Set(calls.map((c) => path.basename(c.out)));
    const orphans = answers.filter((f) => ANSWER_FILE.test(f) && !listed.has(f));
    return {
      calls,
      used: calls.length + orphans.length,
      next: Math.max(0, ...calls.map((c) => c.n), ...orphans.map(numberOf)) + 1,
    };
  });

const numberOf = (file: string) => Number(ANSWER_FILE.exec(file)?.[1] ?? 0);

const callLine = (label: string, c: CallLaid) =>
  Option.match(Option.fromUndefinedOr(c.measures), {
    onNone: () =>
      `parts ${label} answer ${c.n}: ${[c.state, ...Option.toArray(Option.fromUndefinedOr(c.reason))].join(' ')}`,
    onSome: (m) =>
      `parts ${label} answer ${c.n}: seam=${Option.getOrElse(Option.map(m.seam.deltaE, String), () => 'unread')}/${m.seam.pairs} drift=${m.drift.deltaE} chroma=${m.drift.chroma.map((r) => `${r.part}<${r.under}:${r.painted.chroma}/${r.kept.chroma}:${r.verdict}`).join(',')} grain=${m.grain.map((g) => `${g.part}:${g.painted.robust}/${g.kept.robust}|${g.fine.painted.share}/${g.fine.kept.share}/${g.fine.cells}:${g.verdict}`).join(',')} speck=${m.speck.map((r) => `${r.part}<${r.under}:${r.painted.share}/${r.kept.share}:${r.verdict}`).join(',')} step=${m.step.map((s) => `${s.part}|${s.meets}<${s.under}:${s.laid}/${s.answer}/${s.pairs}:${s.verdict}`).join(',')} painted=${m.paintedPx}px visible=${m.visibleAtRest} missed=${
        missesOf(m)
          .map((x) => `${x.bar}:${x.weight.toFixed(2)}`)
          .join(',') || 'none'
      }`,
  });

export const runParts = Effect.fn('film.concept.parts.run')(function* (job: PartsJob) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const refuse = (reason: string) => PartsUnmade.make({ view: `${job.kind}-${job.name}`, reason });
  const { dir, label } = job;
  const { view, sheet } = askedOf(job.view, job.sheet, job.frame);
  const made = inputOf(view, sheet, job.hidden.moving, job.portrait);
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
  const byRank = Order.mapInput(rankOrder, (t: (typeof tried)[number]) => t.measures);
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
  const laidWhole = Option.match(job.frame, {
    onNone: () => best.made,
    onSome: (f) => laidInto(job.sheet, best.made, f.at),
  });
  const whole = yield* Option.match(job.clean, {
    onNone: () => Effect.succeed(laidWhole),
    onSome: (clean) =>
      Effect.fromResult(clean(laidWhole)).pipe(
        Effect.map(countedOf),
        Effect.mapError((e) => refuse(e.message)),
      ),
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
  if (job.mode === 'check') {
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
    `parts ${label} kept answer ${best.call.n} missed=${record.missed.join(',') || 'none'} parts=${best.made.parts.length} dir=${dir} okra=${used - prior.used} rewrote=${differs.map(([f]) => f).join(',') || 'none'}`,
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
    const film = yield* filmNamed(input.film);
    const folder = yield* castFolder(film, input.member);
    const cut = yield* viewCutOf(folder, input.member, input.view);
    const { name, table, view, sheet, paper, label } = cut;
    if (input.dryRun) {
      const asked = askedOf(view, sheet, cut.frame);
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
      for (const line of [
        ...paper.held.map((p) => `parts ${label} paper held [${p.box.join(',')}] ${p.area}px`),
        ...paper.open.map(
          (p) => `parts ${label} paper gap [${p.box.join(',')}] ${p.area}px: ${p.why}`,
        ),
      ])
        yield* Console.log(line);
      return yield* Console.log(
        `parts ${label} dry-run parts=${sheet.parts.length} moving=${table.hidden.moving.join(',')} hidden=${made.hidden.reduce((a, b) => a + b, 0)}px cut=${cut.cutMs}ms mask=${mask} okra=0`,
      );
    }
    const modes = [
      ['call', !input.reuse && !input.check],
      ['reuse', input.reuse && !input.check],
      ['check', input.check],
    ] as const;
    yield* runParts(jobOf(cut, input.film, modes.find(([, on]) => on)?.[0] ?? 'check'));
  }),
).pipe(
  Command.withDescription(
    "Cut a kept view into its part sheet and paint what its moving parts hide: okra (subscription route) repaints their magenta areas, each answer is laid back by one similarity fitted on colour and laid only under the parts in front, in their tone; the best answer of the view's budget of calls (three, and any allowance its cut table records) is kept with its seam, drift and grain under the member's cutout/sheets/<view>/",
  ),
  Command.provide(ImageRoute.layer),
);

export const viewCutOf = Effect.fn('film.concept.parts.viewCut')(function* (
  folder: string,
  member: string,
  asked: string,
) {
  const path = yield* Path.Path;
  const { kind, name } = yield* Effect.fromResult(viewOf(asked));
  const refuse = (reason: string) => PartsUnmade.make({ view: asked, reason });
  const memberDir = path.dirname(folder);
  const table = yield* cutTableOf(path.join(memberDir, 'cutout', 'cut.ts'), name, refuse);
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
  const paper = table.paperOf(name, view);
  const stale = paper.stale.map(
    (g) =>
      `the gap at [${g.at.join(',')}] names the box [${g.box.join(',')}] but opens ${Option.match(
        Arr.head(g.opened),
        {
          onNone: () => 'no piece of enclosed paper',
          onSome: () => g.opened.map((b) => `[${b.join(',')}]`).join(' and '),
        },
      )}`,
  );
  if (stale.length > 0)
    return yield* refuse(
      `${member}.${asked}: ${stale.join('; ')}; name its box again in the view's gaps, or drop it`,
    );
  const started = yield* Clock.currentTimeMillis;
  const sheet = yield* Effect.fromResult(
    Result.mapError(cutParts(view, table.cut, table.optionsFor(name, view)), (e) =>
      refuse(e.message),
    ),
  );
  const cutMs = (yield* Clock.currentTimeMillis) - started;
  return {
    member,
    asked,
    kind,
    name,
    table,
    view,
    sheet,
    paper,
    cutMs,
    label: `${member}.${asked}`,
    dir: path.join(memberDir, 'cutout', 'sheets', name),
    frame: Option.map(frame, (f) => ({ at: f.at, size: f.size, box: f.box })),
  };
});

export const jobOf = (
  cut: Effect.Success<ReturnType<typeof viewCutOf>>,
  film: string,
  mode: PartsJob['mode'],
): PartsJob => ({
  label: cut.label,
  command: `film concept parts ${film} ${cut.member} --view ${cut.asked}`,
  kind: cut.kind,
  name: cut.name,
  view: cut.view,
  sheet: cut.sheet,
  hidden: cut.table.hidden,
  dir: cut.dir,
  mode,
  portrait: PORTRAIT,
  frame: cut.frame,
  clean: cut.table.clean,
});
