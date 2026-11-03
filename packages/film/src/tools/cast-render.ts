import {
  Array as Arr,
  Boolean as Bool,
  DateTime,
  Effect,
  FileSystem,
  Option,
  Path,
  Record as Rec,
  Result,
  Schema,
} from 'effect';
import {
  type CastFigure,
  type CastModule,
  CUTOUT_BOILS,
  CUTOUT_MARGIN,
  type CutoutView,
  castPage,
  defaultFigure,
  isCastModule,
} from '../canvas/cast.ts';
import { BOIL_AMP } from '../core/boil.ts';
import { type Rgb, deltaE, labsOf } from '../core/cast-sheet-pixels.ts';
import {
  type CastRender,
  CastRenderJson,
  type CastViewRendered,
  answerFinding,
  castRenderMarkdown,
  fitHeld,
} from '../core/cast-render.ts';
import { CastSheetJson, type CastSheetRecord, castKindPlan } from '../core/cast-record.ts';
import { keptFile, SheetKind } from '../core/cast-sheet.ts';
import type { CritiqueFinding } from '../core/critique.ts';
import { measureFigure } from '../core/figure.ts';
import {
  type FitRow,
  type FitSpec,
  figureOf,
  fitRows,
  measuringGround,
  neighbourMask,
  overGround,
} from '../core/fit-rows.ts';
import type { SceneTimes } from '../core/easel.ts';
import { castConceptImage, compareFigures, matchTable } from '../core/match.ts';
import { rasterOf } from '../core/puppet.ts';
import { type Raster, besideRaster, cropRaster } from '../core/raster.ts';
import { puppetFrom } from '../puppet/load.ts';

import {
  CastRenderRefused,
  drawnViews,
  keptViews,
  renderedKinds,
  tableSheet,
  tableViews,
} from './cast-kinds.ts';
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

const SHEET_VIEW = { mode: 'plain', captions: false, format: 'image/png' } as const;

const SIDE_GAP = 16;

const PAGE_OFFSET: Readonly<Record<CastFigure, readonly [number, number]>> = {
  rig: [0, 0],
  cutout: CUTOUT_MARGIN,
};

const onPage = (box: readonly [number, number, number, number], figure: CastFigure) => {
  const [dx, dy] = PAGE_OFFSET[figure];
  return [box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy] as const;
};

interface CastRenderAsk {
  readonly kinds: ReadonlyArray<SheetKind>;
  readonly views: ReadonlyArray<string>;
  readonly critique: boolean;
  readonly fitOnly: boolean;
  readonly figure?: CastFigure;
  readonly boil?: number;
}

const renderRoot = Effect.fn('Cast.renderRoot')(function* (film: FilmName, member: string) {
  const path = yield* Path.Path;
  return path.join((yield* FilmFolder).paths(film).out, 'cast', member, 'render');
});

const measured = (concept: Raster, render: Raster) => {
  const c = measureFigure(concept);
  const r = measureFigure(render);
  if (Result.isFailure(c))
    return Result.fail(`the kept view reads no figure: ${c.failure.message}`);
  if (Result.isFailure(r)) return Result.fail(`the render reads no figure: ${r.failure.message}`);
  return Result.succeed(compareFigures(c.success, r.success));
};

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
  readonly ground: Option.Option<Rgb>;
  readonly deltaE: number;
}

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
    ...Option.match(cut.ground, { onNone: () => ({}), onSome: (ground) => ({ ground }) }),
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

const NOT_ASKED: CritiqueTaken = {
  figures: [],
  cached: false,
  skipped: 'asked with --no-critique',
  rejected: [],
};

const tableOf = Effect.fn('Cast.table')(function* (member: string, file: string) {
  const loaded: unknown = yield* Effect.tryPromise({
    try: () => importFilmModule(file),
    catch: (e) => CastRenderRefused.make({ member, reason: `${file} does not load: ${String(e)}` }),
  });
  if (!isCastModule(loaded))
    return yield* CastRenderRefused.make({
      member,
      reason: `${file} exports no SHEETS and PAPER beside a CAST or CUTOUT`,
    });
  return loaded;
});

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
  const conceptRef = { image: castConceptImage(member, kind, cut.v.name), box: cut.v.box };
  const tableText = Result.match(cut.rows, {
    onFailure: (why) => `### ${cut.stem} (${place})\n\nUnmatched: ${why}\n`,
    onSuccess: (rows) => matchTable(cut.stem, conceptRef, rows, place),
  });
  yield* fs.writeFileString(path.join(dir, `${cut.stem}.md`), tableText);
});

interface KindPage {
  readonly pool: ExportPages;
  readonly scenes: ReadonlyArray<SceneTimes>;
}

const pageOf = (at: RenderAt, kind: SheetKind): KindPage => at.own.get(kind) ?? at;

interface RenderAt {
  readonly member: string;
  readonly record: CastSheetRecord;
  readonly folder: string;
  readonly table: CastModule;
  readonly pool: ExportPages;
  readonly scenes: ReadonlyArray<SceneTimes>;
  readonly own: ReadonlyMap<SheetKind, KindPage>;
  readonly root: string;
  readonly dir: string;
  readonly n: number;
  readonly views: ReadonlyArray<string>;
  readonly critique: boolean;
  readonly write: boolean;
  readonly figure: CastFigure;
  readonly cutout: Option.Option<CutoutReading>;
}

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

interface CutoutPosed {
  readonly posed: Raster;
  readonly neighbour: Option.Option<Uint8Array>;
}

interface CutoutReading {
  readonly ground: Rgb;
  readonly views: ReadonlyMap<string, CutoutPosed>;
}

const PartSheetBox = Schema.fromJsonString(
  Schema.Struct({ box: Schema.Tuple([Schema.Int, Schema.Int, Schema.Int, Schema.Int]) }),
);

const neighbourOf = Effect.fn('Cast.neighbourOf')(function* (
  memberDir: string,
  view: string,
  box: readonly [number, number, number, number],
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = path.join(memberDir, 'cutout', 'sheets', view);
  const file = path.join(dir, 'neighbour.png');
  if (!(yield* fs.exists(file))) return Option.none<Uint8Array>();
  const still = yield* Effect.fromResult(decodePng(yield* fs.readFile(file)));
  const recordFile = path.join(dir, 'record.json');
  const record = yield* Effect.fromResult(
    Result.mapError(Schema.decodeResult(PartSheetBox)(yield* fs.readFileString(recordFile)), (e) =>
      FileInvalid.make({ file: recordFile, reason: e.message }),
    ),
  );
  const [w, h] = [box[2] - box[0], box[3] - box[1]];
  const at = [box[0] - record.box[0], box[1] - record.box[1]] as const;
  const mask = neighbourMask(still, at, w, h);
  if (Option.isNone(mask))
    return yield* FileInvalid.make({
      file,
      reason: `the view's box ${w}x${h} at ${at[0]},${at[1]} leaves the ${still.width}x${still.height} still`,
    });
  return mask;
});

const posedOf = Effect.fn('Cast.posedOf')(function* (v: CutoutView) {
  const raster = rasterOf(yield* puppetFrom(v.puppet), v.pose);
  const [ox, oy] = [
    v.puppet.origin[0] + v.box[0] - v.at[0],
    v.puppet.origin[1] + v.box[1] - v.at[1],
  ];
  return cropRaster(raster, [ox, oy, ox + v.box[2] - v.box[0], oy + v.box[3] - v.box[1]]);
});

const cutoutReading = Effect.fn('Cast.cutoutReading')(function* (
  table: CastModule,
  member: string,
  memberDir: string,
) {
  const kinds = Option.getOrElse(Option.fromUndefinedOr(table.CUTOUT?.[member]), () => ({}));
  const entries = Object.entries(kinds).flatMap(([kind, views]) =>
    Object.entries(views).map(([view, v]) => [kind, view, v] as const),
  );
  const views = yield* Effect.forEach(entries, ([kind, view, v]) =>
    Effect.map(
      Effect.all({ posed: posedOf(v), neighbour: neighbourOf(memberDir, view, v.box) }),
      (read) => [`${kind}-${view}`, read] as const,
    ),
  );
  const classes = Object.values(
    Option.getOrElse(Option.fromUndefinedOr(table.FIT_CLASSES?.[member]), () => ({})),
  );
  return {
    ground: measuringGround(
      views.map(([, read]) => read.posed),
      classes.flatMap((c) => c.sheet),
    ),
    views: new Map(views),
  } satisfies CutoutReading;
});

const fitRead = (
  at: RenderAt,
  kind: SheetKind,
  view: string,
  render: Raster,
): { readonly read: Raster; readonly spec: FitSpec; readonly ground: Option.Option<Rgb> } => {
  const spec = fitSpecOf(at.table, at.member, kind, view, at.figure);
  const looks = Option.isSome(
    Option.fromUndefinedOr(at.table.CUTOUT?.[at.member]?.[kind]?.[view]?.look),
  );
  return Option.match(
    Option.flatMap(
      Option.filter(at.cutout, () => !looks),
      (c) =>
        Option.map(Option.fromUndefinedOr(c.views.get(`${kind}-${view}`)), (v) => ({
          ground: c.ground,
          v,
        })),
    ),
    {
      onNone: () => ({ read: render, spec, ground: Option.none() }),
      onSome: ({ ground, v }) => ({
        read: overGround(v.posed, ground),
        spec: Option.match(v.neighbour, {
          onNone: () => spec,
          onSome: (neighbour) => ({ ...spec, neighbour }),
        }),
        ground: Option.some(ground),
      }),
    },
  );
};

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

const COST_DRAWS = 7;

const drawCost = Effect.fn('Cast.drawCost')(function* (at: RenderAt, kind: SheetKind) {
  const { pool, scenes } = pageOf(at, kind);
  const scene = Arr.findFirst(scenes, (s) => s.id === kind);
  if (Option.isNone(scene)) return 0;
  const i = Math.floor((scene.value.start + scene.value.dur / 2) * pool.info.fps);
  const times = [
    ...(yield* pool.call(
      'drawTimes',
      Array.from({ length: COST_DRAWS }, () => i),
    )),
  ];
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] ?? 0;
});

const renderKind = Effect.fn('Cast.renderKind')(function* (at: RenderAt, kind: SheetKind) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { member, record, dir } = at;
  const { pool, scenes } = pageOf(at, kind);
  const scene = yield* Effect.fromOption(Arr.findFirst(scenes, (s) => s.id === kind)).pipe(
    Effect.mapError(() =>
      CastRenderRefused.make({ member, reason: `its page draws no ${kind} scene` }),
    ),
  );
  const png = yield* pool.call(
    'still',
    Math.floor((scene.start + scene.dur / 2) * pool.info.fps),
    SHEET_VIEW,
  );
  if (at.write) yield* fs.writeFile(path.join(dir, `${kind}.render.png`), png);
  const drawn = yield* Effect.fromResult(decodePng(png));
  const layout = Option.getOrElse(
    Option.orElse(
      Option.flatMap(Result.getSuccess(castKindPlan(record, kind)), (p) => p.layout),
      () =>
        Option.filter(
          Option.fromUndefinedOr(record.sheets.single?.layout),
          () => kind === 'single',
        ),
    ),
    () => turnaroundLayout(record.who),
  );
  const place = `${member}'s ${kind} sheet, render ${at.n}`;
  const asked = keptViews(record, kind)
    .filter((v) => at.views.length === 0 || at.views.includes(`${kind}-${v.name}`))
    .filter((v) => drawnViews(at.table, member, kind, at.figure).includes(v.name));
  const byFile = Rec.toEntries(Arr.groupBy(asked, (v) => keptFile(kind, v.name)));
  const cuts = (yield* Effect.forEach(byFile, ([file, views]) =>
    fs.readFile(path.join(at.folder, file)).pipe(
      Effect.flatMap((bytes) => Effect.fromResult(decodePng(bytes))),
      Effect.map((keptSheet) => views.map((v) => ({ v, keptSheet }))),
    ),
  ))
    .flat()
    .map(({ v, keptSheet }): Cut => {
      const concept = cropRaster(keptSheet, v.box);
      const render = cropRaster(drawn, onPage(v.box, at.figure));
      const fit = fitRead(at, kind, v.name, render);
      return {
        v,
        stem: `${kind}-${v.name}`,
        concept,
        render,
        rows: measured(concept, render),
        fit: fitRows(concept, fit.read, fit.spec),
        ground: fit.ground,
        deltaE: meanDeltaE(concept, render),
      };
    });
  if (!at.write) return yield* critiqued(at, kind, cuts, place, layout);
  yield* Effect.forEach(cuts, (cut) => writeCut(dir, place, member, kind, cut));
  const views = yield* critiqued(at, kind, cuts, place, layout);
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
  const figure = ask.figure ?? defaultFigure(table, member);
  const boil = ask.boil ?? BOIL_AMP;
  if (!CUTOUT_BOILS.includes(boil))
    return yield* CastRenderRefused.make({
      member,
      reason: `a cut-out page boils at ${CUTOUT_BOILS.join(' or ')} px, not ${boil}`,
    });
  const kinds = yield* renderedKinds(member, table, record, ask, figure);
  const root = yield* renderRoot(film, member);
  const { n, dir } = yield* Bool.match(ask.fitOnly, {
    onTrue: () => Effect.succeed({ n: 0, dir: root }),
    onFalse: () => reserveNumbered(root),
  });
  const pages = yield* Pages;
  const open = Effect.fn('Cast.openPage')(function* (kind?: SheetKind) {
    const pool = yield* pages.open(castPage(film, member, figure, boil, kind), {
      workers: 1,
      captions: false,
      server: Option.none(),
    });
    return { pool, scenes: yield* pool.call('scenes') };
  });
  const { pool, scenes } = yield* open();
  const own = new Map(
    yield* Effect.forEach(
      kinds.filter((kind) => figure === 'cutout' && !scenes.some((s) => s.id === kind)),
      (kind) => Effect.map(open(kind), (page) => [kind, page] as const),
    ),
  );
  const cutout = yield* Bool.match(figure === 'cutout', {
    onTrue: () => Effect.asSome(cutoutReading(table, member, path.dirname(folder))),
    onFalse: () => Effect.succeed(Option.none<CutoutReading>()),
  });
  const at: RenderAt = {
    member,
    record,
    folder,
    table,
    pool,
    scenes,
    own,
    root,
    dir,
    n,
    views: ask.views,
    critique: ask.critique && !ask.fitOnly,
    write: !ask.fitOnly,
    figure,
    cutout,
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
    ...{ rig: {}, cutout: { boil } }[figure],
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
