// A member's cast render (`film concept render`): each kept view of his
// sheets drawn by its rig, held to the view the owner kept. The film's table
// (`rigs/cast.ts`, `CastTable`) names a rig and a pose for every kept view;
// its page (`<film>/cast/<member>`, `player/cast.ts`) draws each kind of his
// sheets as one still on a canvas the sheet's size, through the export page
// a render draws with (`Pages`). Each view is cut from that still and from
// the kept sheet by its kept box, both measured and compared with the
// match's own code (`measureFigure`, `compareFigures`, `matchTable`), held
// to its fit rows (`core/fit-rows.ts`: its member's classes and its own
// probes and bars from the table), laid side by side at 1:1, and shown to a
// fresh model at 1:1 once every fit row passes (`Critic`, one run a sheet,
// with the view's clause of the sheet's layout, `askedOf`); a view whose rows
// fail is never sent, its critique skipped with them (`fitHeld`). It all
// lands in `out/<film>/cast/<member>/render/<n>/` with its record
// (`render.json`, `core/cast-render.ts`) and summary (`render.md`). A
// finding is answered on the render that found it (`answerCast`): it stands,
// and why; a fix is a new render.

import {
  Array as Arr,
  Boolean as Bool,
  DateTime,
  Effect,
  FileSystem,
  Option,
  Path,
  Predicate,
  Result,
  Schema,
} from 'effect';
import {
  type CastFigure,
  type CastModule,
  type CastView,
  CUTOUT_MARGIN,
  castPage,
} from '../canvas/cast.ts';
import { deltaE, labsOf } from '../core/cast-sheet-pixels.ts';
import {
  type CastRender,
  CastRenderJson,
  type CastViewRendered,
  answerFinding,
  castRenderMarkdown,
  fitHeld,
} from '../core/cast-render.ts';
import { CastSheetJson, type CastSheetRecord, castKindPlan } from '../core/cast-record.ts';
import { SheetKind } from '../core/cast-sheet.ts';
import type { CritiqueFinding } from '../core/critique.ts';
import { measureFigure } from '../core/figure.ts';
import { type FitRow, type FitSpec, figureOf, fitRows } from '../core/fit-rows.ts';
import type { SceneTimes } from '../core/easel.ts';
import { compareFigures, matchTable } from '../core/match.ts';
import { type Raster, besideRaster, cropRaster } from '../core/raster.ts';

import { castFolder } from './cast-library.ts';
import { askedOf } from './cast-sheet-critique.ts';
import { turnaroundLayout } from './cast-sheet-brief.ts';
import { Critic, type CritiqueTaken } from './critique.ts';
import { sha256Hex } from './digest.ts';
import { FileInvalid } from './errors.ts';
import { reserveNumbered } from './numbered-folder.ts';
import { FilmFolder, type FilmName, importFilmModule } from './film-repo.ts';
import { type ExportPages, Pages } from './pages.ts';
import { decodePng, encodePng } from './png.ts';

/** A still of a cast page: the whole sheet, plain, as a PNG, captions off. */
const SHEET_VIEW = { mode: 'plain', captions: false, format: 'image/png' } as const;

/** The gap round and between the two crops of a side-by-side, pixels. */
const SIDE_GAP = 16;

/** Where each figure's page stands the sheet: a cut-out's page is the sheet grown by `CUTOUT_MARGIN`. */
const PAGE_OFFSET: Readonly<Record<CastFigure, readonly [number, number]>> = {
  rig: [0, 0],
  cutout: CUTOUT_MARGIN,
};

/** A sheet box where `figure`'s page draws it. */
const onPage = (box: readonly [number, number, number, number], figure: CastFigure) => {
  const [dx, dy] = PAGE_OFFSET[figure];
  return [box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy] as const;
};

/** A cast render that cannot be made: the film's table, its record or its page do not give what it needs. */
class CastRenderRefused extends Schema.TaggedError<CastRenderRefused>()('CastRenderRefused', {
  member: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.member}'s cast render: ${this.reason}`;
  }
}

/**
 * What a render asks: the kinds to draw (every kind kept when none), the
 * views (`<kind>-<view>`, every view of each kind drawn when none), whether
 * to critique, and whether to read the fit rows alone (`fitOnly`: no
 * critique, nothing written).
 */
interface CastRenderAsk {
  readonly kinds: ReadonlyArray<SheetKind>;
  readonly views: ReadonlyArray<string>;
  readonly critique: boolean;
  readonly fitOnly: boolean;
  /** What draws each view: its rig (`CAST`, by default), or its puppet (`CUTOUT`). */
  readonly figure?: CastFigure;
}

/** The render folder of `member` in `film`'s outputs. */
const renderRoot = Effect.fn('Cast.renderRoot')(function* (film: FilmName, member: string) {
  const path = yield* Path.Path;
  return path.join((yield* FilmFolder).paths(film).out, 'cast', member, 'render');
});

/** A measure's rows of `concept` against `render`, or why none could be read. */
const measured = (concept: Raster, render: Raster) => {
  const c = measureFigure(concept);
  const r = measureFigure(render);
  if (Result.isFailure(c))
    return Result.fail(`the kept view reads no figure: ${c.failure.message}`);
  if (Result.isFailure(r)) return Result.fail(`the render reads no figure: ${r.failure.message}`);
  return Result.succeed(compareFigures(c.success, r.success));
};

/** Whether `u` reads as a film's cast render module: its table, its sheets and its paper. */
const isCastModule = (u: unknown): u is CastModule =>
  Predicate.hasProperty(u, 'CAST') &&
  Predicate.hasProperty(u, 'SHEETS') &&
  Predicate.hasProperty(u, 'PAPER') &&
  Predicate.isObject(u.CAST) &&
  Predicate.isObject(u.SHEETS);

/** One kept view cut from the kept sheet and from the render, its rows and its fit rows. */
interface Cut {
  readonly v: {
    readonly view: number;
    readonly name: string;
    readonly box: readonly [number, number, number, number];
  };
  readonly stem: string;
  readonly concept: Raster;
  readonly render: Raster;
  readonly rows: Result.Result<ReadonlyArray<CastViewRendered['rows'][number]>, string>;
  readonly fit: ReadonlyArray<FitRow>;
  readonly deltaE: number;
}

/** The measure's lines on a cut, as the critique is shown them. */
const flaggedOf = (cut: Cut): ReadonlyArray<string> =>
  Result.match(cut.rows, {
    onFailure: (why) => [`unmatched: ${why}`],
    onSuccess: (rs) =>
      rs
        .filter((r) => r.flagged)
        .map(
          (r) =>
            `${r.name}: concept ${String(r.concept)}, render ${String(r.scene)}${Option.match(Option.fromUndefinedOr(r.note), { onNone: () => '', onSome: (n) => ` (${n})` })}`,
        ),
  });

/** A cut as its render's record holds it: its files, its rows or why none, its critique and its findings, numbered. */
const renderedOf = (kind: string, cut: Cut, taken: CritiqueTaken): CastViewRendered => {
  const skipped = Option.fromUndefinedOr(taken.skipped);
  const found = Option.getOrElse(
    Option.map(
      Arr.findFirst(taken.figures, (f) => f.figure === cut.stem),
      (f) => f.findings,
    ),
    (): ReadonlyArray<CritiqueFinding> => [],
  );
  return {
    kind,
    view: cut.v.name,
    box: cut.v.box,
    files: {
      concept: `${cut.stem}.concept.png`,
      render: `${cut.stem}.render.png`,
      side: `${cut.stem}.side.png`,
      table: `${cut.stem}.md`,
      critique: `${cut.stem}.critique.md`,
    },
    rows: Result.getOrElse(cut.rows, () => []),
    unmatched: Result.getFailure(cut.rows),
    fit: cut.fit,
    deltaE: cut.deltaE,
    critique: Option.match(skipped, {
      onNone: () => 'taken' as const,
      onSome: () => 'skipped' as const,
    }),
    skipped,
    findings: found.map((f, i) => ({
      id: `f${i + 1}`,
      aspect: f.aspect,
      what: f.what,
      where: Option.fromUndefinedOr(f.where),
      stands: Option.none(),
    })),
  };
};

/** A critique that was not asked for: written as skipped, never as a pass. */
const NOT_ASKED: CritiqueTaken = {
  figures: [],
  cached: false,
  skipped: 'asked with --no-critique',
  rejected: [],
};

/** The film's cast render module, loaded from its `rigs/cast.ts`. */
const tableOf = Effect.fn('Cast.table')(function* (member: string, file: string) {
  const loaded: unknown = yield* Effect.tryPromise({
    try: () => importFilmModule(file),
    catch: (e) => CastRenderRefused.make({ member, reason: `${file} does not load: ${String(e)}` }),
  });
  if (!isCastModule(loaded))
    return yield* CastRenderRefused.make({
      member,
      reason: `${file} exports no CAST, SHEETS and PAPER`,
    });
  return loaded;
});

/** `member`'s views of `kind` in the table: none when it draws none. */
const tableViews = (table: CastModule, member: string, kind: SheetKind) =>
  Option.fromUndefinedOr(table.CAST[member]).pipe(
    Option.flatMap((kinds) => Option.fromUndefinedOr(kinds[kind])),
    Option.getOrElse((): Readonly<Record<string, CastView>> => ({})),
  );

/** The names of `member`'s views of `kind` that `figure` draws: the rigs' table's, or the cut-out table's. */
const drawnViews = (table: CastModule, member: string, kind: SheetKind, figure: CastFigure) =>
  ({
    rig: () => Object.keys(tableViews(table, member, kind)),
    cutout: () =>
      Object.keys(
        Option.getOrElse(Option.fromUndefinedOr(table.CUTOUT?.[member]?.[kind]), () => ({})),
      ),
  })[figure]();

/** The mean ΔE76 of `render` against `concept` over the union of their figures (`figureOf`, the fit rows' reading). */
const meanDeltaE = (concept: Raster, render: Raster) => {
  const [a, b] = [figureOf(concept).figure, figureOf(render).figure];
  const [la, lb] = [labsOf(concept), labsOf(render)];
  let [sum, n] = [0, 0];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 0 && b[i] === 0) continue;
    sum += deltaE(la(i), lb(i));
    n++;
  }
  return sum / Math.max(1, n);
};

/** `member`'s sheet of `kind` in the table: its size and scale. */
const tableSheet = (table: CastModule, member: string, kind: SheetKind) =>
  Option.fromUndefinedOr(table.SHEETS[member]).pipe(
    Option.flatMap((sheets) => Option.fromUndefinedOr(sheets[kind])),
  );

/** The views the owner kept of `kind`: none when he kept no such sheet. */
const keptViews = (record: CastSheetRecord, kind: SheetKind) =>
  Option.fromUndefinedOr(record.kept).pipe(
    Option.flatMap((kept) => Option.fromUndefinedOr(kept[kind])),
    Option.map((k) => k.views),
    Option.getOrElse((): ReadonlyArray<Cut['v']> => []),
  );

/**
 * Refused unless the table draws every kept view of each kind asked (each
 * view asked, for a cut-out: a member has puppets only for the views cut),
 * and gives each sheet its scale.
 */
const coveredBy = (
  member: string,
  table: CastModule,
  record: CastSheetRecord,
  kinds: ReadonlyArray<SheetKind>,
  asked: ReadonlyArray<string>,
  figure: CastFigure,
) =>
  Effect.forEach(kinds, (kind) => {
    const views = drawnViews(table, member, kind, figure);
    const missing = keptViews(record, kind).filter(
      (v) => !views.includes(v.name) && (figure === 'rig' || asked.includes(`${kind}-${v.name}`)),
    );
    if (missing.length > 0)
      return CastRenderRefused.make({
        member,
        reason: {
          rig: `rigs/cast.ts draws no ${missing.map((v) => `${kind} ${v.name}`).join(', ')}: every kept view needs a rig and a pose`,
          cutout: `rigs/cast.ts has no puppet for ${missing.map((v) => `${kind} ${v.name}`).join(', ')} (CUTOUT)`,
        }[figure],
      });
    if (Option.isNone(tableSheet(table, member, kind)))
      return CastRenderRefused.make({
        member,
        reason: `rigs/cast.ts gives the ${kind} sheet no scale`,
      });
    return Effect.void;
  });

/** Each cut's files written into `dir`: its two crops, its side-by-side at 1:1 and its table. */
const writeCut = Effect.fn('Cast.writeCut')(function* (
  dir: string,
  place: string,
  member: string,
  kind: SheetKind,
  cut: Cut,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.writeFile(path.join(dir, `${cut.stem}.concept.png`), encodePng(cut.concept));
  yield* fs.writeFile(path.join(dir, `${cut.stem}.render.png`), encodePng(cut.render));
  const side = besideRaster(
    [
      { raster: cut.concept, top: 0 },
      { raster: cut.render, top: 0 },
    ],
    SIDE_GAP,
  );
  yield* fs.writeFile(path.join(dir, `${cut.stem}.side.png`), encodePng(side));
  const conceptRef = { image: { cast: member, sheet: kind }, box: cut.v.box } as const;
  const tableText = Result.match(cut.rows, {
    onFailure: (why) => `### ${cut.stem} (${place})\n\nUnmatched: ${why}\n`,
    onSuccess: (rows) => matchTable(cut.stem, conceptRef, rows, place),
  });
  yield* fs.writeFileString(path.join(dir, `${cut.stem}.md`), tableText);
});

/** Where one render is drawn and written: its member's record, sheet folder and table, its page, its folder and number, the views asked, whether it critiques and whether it writes. */
interface RenderAt {
  readonly member: string;
  readonly record: CastSheetRecord;
  readonly folder: string;
  readonly table: CastModule;
  readonly pool: ExportPages;
  readonly scenes: ReadonlyArray<SceneTimes>;
  readonly root: string;
  readonly dir: string;
  readonly n: number;
  readonly views: ReadonlyArray<string>;
  readonly critique: boolean;
  readonly write: boolean;
  readonly figure: CastFigure;
}

/**
 * What a view's fit rows hold it to: its member's colour classes, and its
 * own part labels, probes and bars (`rigs/cast.ts`; a cut-out view's own,
 * else its rig view's). A cut-out is painted with the sheet's own pixels,
 * not the rig's papers, so its classes are read on the render by their
 * sheet samples.
 */
const fitSpecOf = (
  table: CastModule,
  member: string,
  kind: SheetKind,
  view: string,
  figure: CastFigure,
): FitSpec => {
  const rigFit = Option.flatMap(
    Option.fromUndefinedOr(tableViews(table, member, kind)[view]),
    (v) => Option.fromUndefinedOr(v.fit),
  );
  const fit = {
    rig: () => rigFit,
    cutout: () =>
      Option.orElse(
        Option.fromUndefinedOr(table.CUTOUT?.[member]?.[kind]?.[view]?.fit),
        () => rigFit,
      ),
  }[figure]();
  const classes = Option.getOrElse(Option.fromUndefinedOr(table.FIT_CLASSES?.[member]), () => ({}));
  return {
    classes: {
      rig: () => classes,
      cutout: () =>
        Object.fromEntries(
          Object.entries(classes).map(([name, c]) => [name, { sheet: c.sheet, paper: c.sheet }]),
        ),
    }[figure](),
    labels: Option.getOrElse(
      Option.flatMap(fit, (f) => Option.fromUndefinedOr(f.labels)),
      () => ({}),
    ),
    probes: Option.getOrElse(
      Option.flatMap(fit, (f) => Option.fromUndefinedOr(f.probes)),
      () => [],
    ),
    bars: Option.getOrElse(
      Option.flatMap(fit, (f) => Option.fromUndefinedOr(f.bars)),
      () => ({}),
    ),
  };
};

/**
 * The cuts critiqued: each whose fit rows all pass is shown to the critic
 * (in one run, none when it is not asked or no cut passes); each other is
 * held, skipped with its failing rows (`fitHeld`), never sent. Each cut as
 * its record holds it.
 */
const critiqued = Effect.fn('Cast.critiqued')(function* (
  at: RenderAt,
  kind: SheetKind,
  cuts: ReadonlyArray<Cut>,
  place: string,
  layout: string,
) {
  const path = yield* Path.Path;
  const held = (cut: Cut) => fitHeld(cut.fit);
  const sent = cuts.filter((cut) => Option.isNone(held(cut)));
  const critic = yield* Critic;
  const taken = yield* Bool.match(at.critique && sent.length > 0, {
    onTrue: () =>
      critic.critiqueSheet({
        drawn: 'render',
        place,
        kept: path.join(at.root, 'answers'),
        views: sent.map((cut) => ({
          figure: cut.stem,
          concept: path.join(at.dir, `${cut.stem}.concept.png`),
          sheet: path.join(at.dir, `${cut.stem}.render.png`),
          flagged: flaggedOf(cut),
          file: path.join(at.dir, `${cut.stem}.critique.md`),
          layout: Option.some(askedOf(layout, cut.v.view)),
        })),
      }),
    onFalse: () =>
      Effect.succeed(
        Bool.match(at.write, {
          onTrue: () => NOT_ASKED,
          onFalse: () => ({ ...NOT_ASKED, skipped: 'asked with --fit-only' }),
        }),
      ),
  });
  return cuts.map((cut) =>
    Option.match(held(cut), {
      onNone: () => renderedOf(kind, cut, taken),
      onSome: (why) =>
        renderedOf(kind, cut, { figures: [], cached: false, skipped: why, rejected: [] }),
    }),
  );
});

/** How many times a sheet's frame is drawn for its cost. */
const COST_DRAWS = 7;

/** The median ms the page takes to draw `kind`'s frame (`drawTimes`: the draw alone, rastered, no encoder). */
const drawCost = Effect.fn('Cast.drawCost')(function* (at: RenderAt, kind: SheetKind) {
  const scene = Arr.findFirst(at.scenes, (s) => s.id === kind);
  if (Option.isNone(scene)) return 0;
  const i = Math.floor((scene.value.start + scene.value.dur / 2) * at.pool.info.fps);
  const times = [
    ...(yield* at.pool.call(
      'drawTimes',
      Array.from({ length: COST_DRAWS }, () => i),
    )),
  ];
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] ?? 0;
});

/** One kind of the member's sheets drawn as one still, each kept view asked cut from it and from the kept sheet, held to its fit rows, written, critiqued once its rows pass. */
const renderKind = Effect.fn('Cast.renderKind')(function* (at: RenderAt, kind: SheetKind) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { member, record, dir } = at;
  const scene = yield* Effect.fromOption(Arr.findFirst(at.scenes, (s) => s.id === kind)).pipe(
    Effect.mapError(() =>
      CastRenderRefused.make({ member, reason: `its page draws no ${kind} scene` }),
    ),
  );
  const png = yield* at.pool.call(
    'still',
    Math.floor((scene.start + scene.dur / 2) * at.pool.info.fps),
    SHEET_VIEW,
  );
  if (at.write) yield* fs.writeFile(path.join(dir, `${kind}.render.png`), png);
  const drawn = yield* Effect.fromResult(decodePng(png));
  const keptSheet = yield* Effect.fromResult(
    decodePng(yield* fs.readFile(path.join(at.folder, 'kept', `${kind}.png`))),
  );
  const layout = Option.getOrElse(
    Option.flatMap(Result.getSuccess(castKindPlan(record, kind)), (p) => p.layout),
    () => turnaroundLayout(record.who),
  );
  const place = `${member}'s ${kind} sheet, render ${at.n}`;
  const cuts = keptViews(record, kind)
    .filter((v) => at.views.length === 0 || at.views.includes(`${kind}-${v.name}`))
    .filter((v) => drawnViews(at.table, member, kind, at.figure).includes(v.name))
    .map((v): Cut => {
      const concept = cropRaster(keptSheet, v.box);
      const render = cropRaster(drawn, onPage(v.box, at.figure));
      return {
        v,
        stem: `${kind}-${v.name}`,
        concept,
        render,
        rows: measured(concept, render),
        fit: fitRows(concept, render, fitSpecOf(at.table, member, kind, v.name, at.figure)),
        deltaE: meanDeltaE(concept, render),
      };
    });
  if (!at.write) return yield* critiqued(at, kind, cuts, place, layout);
  yield* Effect.forEach(cuts, (cut) => writeCut(dir, place, member, kind, cut));
  const views = yield* critiqued(at, kind, cuts, place, layout);
  // A skipped critique is written as skipped, with its reason, in the view's file.
  yield* Effect.forEach(views, (v) =>
    Option.match(v.skipped, {
      onNone: () => Effect.void,
      onSome: (why) =>
        fs.writeFileString(
          path.join(dir, v.files.critique),
          `# ${kind}-${v.view}\n\nSkipped: ${why}\n`,
        ),
    }),
  );
  return views;
});

/**
 * Render `member` of `film`: each kept view of each kind `ask` names, drawn,
 * measured, laid beside its kept view and critiqued, into the next render's
 * folder. Answers the render's record and its folder.
 */
export const renderCast = Effect.fn('Cast.render')(function* (
  film: FilmName,
  member: string,
  ask: CastRenderAsk,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const paths = (yield* FilmFolder).paths(film);
  const folder = yield* castFolder(film, member);
  const recordFile = path.join(folder, 'cast-sheet.json');
  const record = yield* Effect.fromResult(
    Result.mapError(Schema.decodeResult(CastSheetJson)(yield* fs.readFileString(recordFile)), (e) =>
      FileInvalid.make({ file: recordFile, reason: e.message }),
    ),
  );
  const rigs = path.join(paths.dir, 'rigs');
  const table = yield* tableOf(member, path.join(rigs, 'cast.ts'));
  const riv = sha256Hex(yield* fs.readFile(path.join(rigs, 'figures.riv')));
  const kept = SheetKind.literals.flatMap((k) => keptViews(record, k).map((v) => `${k}-${v.name}`));
  const unknown = ask.views.filter((v) => !kept.includes(v));
  if (unknown.length > 0)
    return yield* CastRenderRefused.make({
      member,
      reason: `no kept view ${unknown.join(', ')} (kept: ${kept.join(', ')})`,
    });
  const figure = ask.figure ?? 'rig';
  const kinds = Arr.filter(
    SheetKind.literals,
    (k) =>
      keptViews(record, k).length > 0 &&
      drawnViews(table, member, k, figure).length > 0 &&
      (ask.kinds.length === 0 || ask.kinds.includes(k)) &&
      (ask.views.length === 0 || ask.views.some((v) => v.startsWith(`${k}-`))),
  );
  if (kinds.length === 0)
    return yield* CastRenderRefused.make({ member, reason: 'no kind asked is kept' });
  yield* coveredBy(member, table, record, kinds, ask.views, figure);
  const root = yield* renderRoot(film, member);
  // A read of the fit rows alone writes nothing: no render folder is taken.
  const { n, dir } = yield* Bool.match(ask.fitOnly, {
    onTrue: () => Effect.succeed({ n: 0, dir: root }),
    onFalse: () => reserveNumbered(root),
  });
  const pool = yield* (yield* Pages).open(castPage(film, member, figure), {
    workers: 1,
    captions: false,
    server: Option.none(),
  });
  const scenes = yield* pool.call('scenes');
  const at: RenderAt = {
    member,
    record,
    folder,
    table,
    pool,
    scenes,
    root,
    dir,
    n,
    views: ask.views,
    critique: ask.critique && !ask.fitOnly,
    write: !ask.fitOnly,
    figure,
  };
  const views = (yield* Effect.forEach(kinds, (kind) => renderKind(at, kind))).flat();
  const drawMs = yield* Effect.forEach(kinds, (kind) => drawCost(at, kind));
  const sheets = Object.fromEntries(
    kinds.map((kind, i) => [
      kind,
      {
        scale: Option.getOrElse(
          Option.map(tableSheet(table, member, kind), (s) => s.scale),
          () => 0,
        ),
        sheet: `${kind}.render.png`,
        drawMs: drawMs[i] ?? 0,
      },
    ]),
  );
  const made: CastRender = {
    film,
    member,
    n,
    at: DateTime.formatIso(yield* DateTime.now),
    riv,
    figure,
    kinds: sheets,
    views,
  };
  if (ask.fitOnly) return { render: made, dir: Option.none<string>() };
  yield* fs.writeFileString(
    path.join(dir, 'render.json'),
    yield* Schema.encodeEffect(CastRenderJson)(made),
  );
  yield* fs.writeFileString(path.join(dir, 'render.md'), castRenderMarkdown(made));
  return { render: made, dir: Option.some(dir) };
});

/** Answer finding `finding` (`<kind>-<view>/<id>`) of `member`'s render `n`: it stands, for `why`, in its record and summary. */
export const answerCast = Effect.fn('Cast.answer')(function* (
  film: FilmName,
  member: string,
  n: number,
  finding: string,
  why: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = path.join(yield* renderRoot(film, member), String(n));
  const file = path.join(dir, 'render.json');
  const render = yield* Schema.decodeEffect(CastRenderJson)(yield* fs.readFileString(file)).pipe(
    Effect.mapError((e) => FileInvalid.make({ file, reason: e.message })),
  );
  const answered = yield* Effect.fromResult(answerFinding(render, finding, why));
  yield* fs.writeFileString(file, yield* Schema.encodeEffect(CastRenderJson)(answered));
  yield* fs.writeFileString(path.join(dir, 'render.md'), castRenderMarkdown(answered));
  return answered;
});
