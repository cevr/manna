import { decodePng, encodePng, type Raster } from '@manna/film/tools';
import { Effect, FileSystem, Option, Path, Result, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import sharp from 'sharp';
import {
  encodeClip,
  frameName,
  loadShot,
  requestOf,
  type RenderPng,
  StorybookFailed,
  storybookPage,
} from '../render.ts';
import { rgbOfHex, splitSheet } from '../sheet.ts';
import { frameAt, litPaints, platesOf, type Shot, timesOf } from '../shot.ts';
import { CAST, memberPalette, sha256, sheetDir, type StoredFigure } from '../store.ts';
import { BARS } from './bars.ts';
import {
  type FrameRead,
  heightSamples,
  lightSamples,
  paletteShare,
  type PlannedFrame,
  pocketCount,
  proportionSamples,
  readFigure,
  scaleSamples,
  stepSamples,
} from './measures.ts';
import { type Measured, one, type Verdict, verdictOf, verdictText } from './verdict.ts';

/** verdict.json: the verdict as the run judged it, two-space indented. */
const VerdictJson = Schema.fromJsonString(
  Schema.Struct({
    passed: Schema.Finite,
    total: Schema.Finite,
    checks: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        pass: Schema.Boolean,
        value: Schema.String,
        at: Schema.String,
        bar: Schema.String,
        source: Schema.Literals(['owner', 'orchestrator-proposed']),
      }),
    ),
  }),
  { space: 2 },
);

const Hashes = Schema.Record(Schema.String, Schema.String);

/** manifest.json: the shot, the git head, each figure's one sheet, every stored cell, every colour frame and every set plate. */
const ManifestJson = Schema.fromJsonString(
  Schema.Struct({
    shot: Schema.String,
    head: Schema.String,
    figures: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        member: Schema.String,
        sheet: Schema.String,
        sha256: Schema.String,
      }),
    ),
    cells: Hashes,
    frames: Hashes,
    set: Schema.Array(Schema.Struct({ file: Schema.String, testArt: Schema.Boolean })),
  }),
  { space: 2 },
);

/** The shot did not meet every bar: `passed` of `total` checks pass. */
export class VerdictFailed extends Schema.TaggedError<VerdictFailed>()('VerdictFailed', {
  passed: Schema.Finite,
  total: Schema.Finite,
}) {
  override get message() {
    return `FAIL ${this.passed}/${this.total}`;
  }
}

/** The figure a shot's scale is read against: the one on the layer nearest the focal plane. */
const leadOf = (figures: ReadonlyArray<StoredFigure>): string =>
  figures.toSorted((a, b) => Math.abs(a.layer.z - 1) - Math.abs(b.layer.z - 1))[0]?.figure.name ??
  '';

const decoded = (png: Uint8Array, at: string) =>
  Effect.fromResult(decodePng(png)).pipe(
    Effect.mapError((e) => StorybookFailed.make({ reason: `${at}: ${e.message}` })),
  );

/** Every render of the run in one page launch: each frame's colour, then each figure alone; answers each render's sha256 in order and hands each to `seen`. */
const launch = <E, R>(
  render: RenderPng,
  planned: ReadonlyArray<PlannedFrame>,
  figures: ReadonlyArray<StoredFigure>,
  seen: (p: PlannedFrame, output: string, png: Uint8Array) => Effect.Effect<void, E, R>,
) =>
  Effect.gen(function* () {
    const hashes: Array<string> = [];
    for (const p of planned)
      for (const output of ['colour', ...figures.map((f) => `figure:${f.figure.name}`)]) {
        const png = yield* render(requestOf(p.frame, output));
        hashes.push(yield* sha256(png));
        yield* seen(p, output, png);
      }
    return hashes;
  });

/** The first launch: every render written under `out` (colour to `frames/`, each figure to `figures/<name>/`) and each figure-alone render read. */
const firstLaunch = Effect.fn('StorybookVerify.firstLaunch')(function* (
  shot: Shot,
  render: RenderPng,
  planned: ReadonlyArray<PlannedFrame>,
  figures: ReadonlyArray<StoredFigure>,
  out: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const byName = new Map(figures.map((f) => [f.figure.name, f] as const));
  const lit = new Map(
    figures.map((f) => [f.figure.name, litPaints(f.paints, shot.light)] as const),
  );
  const reads: Array<FrameRead> = [];
  const colour = new Map<string, string>();
  for (const f of figures)
    yield* fs.makeDirectory(path.join(out, 'figures', f.figure.name), { recursive: true });
  yield* fs.makeDirectory(path.join(out, 'frames'), { recursive: true });
  const hashes = yield* launch(render, planned, figures, (p, output, png) =>
    Effect.gen(function* () {
      const file = frameName(p.index);
      if (output === 'colour') {
        colour.set(file, yield* sha256(png));
        return yield* fs.writeFile(path.join(out, 'frames', file), png);
      }
      const name = output.slice('figure:'.length);
      yield* fs.writeFile(path.join(out, 'figures', name, file), png);
      const stored = byName.get(name);
      const posed = p.frame.figures.find((x) => x.name === name);
      if (!stored || !posed) return;
      reads.push({
        frame: p.index,
        name,
        cell: posed.cell,
        zoom: p.frame.camera.zoom ** (1 / stored.layer.z),
        squashed: posed.sx !== 1 || posed.sy !== 1,
        read: readFigure(yield* decoded(png, `${name} ${file}`), lit.get(name) ?? []),
      });
    }),
  );
  return { hashes, reads, colour };
});

/** The cells each figure draws over the planned frames, by figure name. */
const usedCells = (
  planned: ReadonlyArray<PlannedFrame>,
): ReadonlyMap<string, ReadonlySet<string>> => {
  const used = new Map<string, Set<string>>();
  for (const p of planned)
    for (const f of p.frame.figures) used.set(f.name, (used.get(f.name) ?? new Set()).add(f.cell));
  return used;
};

/** Whether a figure draws only cells of its one sheet, and its stored cells are that sheet's split, byte for byte; answers what is wrong, none when nothing is. */
const sheetFault = Effect.fn('StorybookVerify.sheetFault')(function* (
  f: StoredFigure,
  used: ReadonlySet<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const dir = sheetDir(CAST, f.figure.member, f.figure.sheet);
  const keys = f.record.cells.map((c) => c.key);
  const stray = [...used].find((k) => !keys.includes(k));
  if (stray) return Option.some(`${f.figure.name} draws ${stray}, not a cell of its sheet`);
  const bytes = yield* fs.readFile(`${dir}/sheet.png`);
  if ((yield* sha256(bytes)) !== f.record.sheet)
    return Option.some(`${f.figure.name}'s sheet.png is not the one its record names`);
  const split = splitSheet(
    yield* decoded(bytes, `${dir}/sheet.png`),
    keys.length,
    yield* memberPalette(CAST, f.figure.member),
  );
  if (Result.isFailure(split)) return Option.some(`${f.figure.name}: ${split.failure.reason}`);
  for (const [i, c] of f.record.cells.entries()) {
    const stored = yield* sha256(yield* fs.readFile(`${dir}/cells/${c.key}.png`));
    const fault = Option.some(`${f.figure.name}'s ${c.key} does not re-split byte for byte`);
    const again = Option.fromUndefinedOr(split.success.cells[i]);
    if (Option.isNone(again)) return fault;
    const { box, raster } = again.value;
    if (
      (yield* sha256(encodePng(raster))) !== c.sha256 ||
      stored !== c.sha256 ||
      [box.x, box.y, box.width, box.height].join() !==
        [c.box.x, c.box.y, c.box.width, c.box.height].join()
    )
      return fault;
  }
  return Option.none<string>();
});

/** The stores' measures: each used cell's palette share and pockets, each sheet's proportions, and the one-sheet rule. */
const storeMeasures = Effect.fn('StorybookVerify.storeMeasures')(function* (
  figures: ReadonlyArray<StoredFigure>,
  used: ReadonlyMap<string, ReadonlySet<string>>,
) {
  const cells = figures.flatMap((f) =>
    [...(used.get(f.figure.name) ?? [])].flatMap((key) =>
      Option.toArray(
        Option.map(Option.fromUndefinedOr(f.cells.get(key)), (raster: Raster) => ({
          f,
          key,
          raster,
        })),
      ),
    ),
  );
  const pockets = cells.map((c) => ({
    at: `${c.f.figure.member}/${c.key}`,
    n: pocketCount(c.raster, rgbOfHex(c.f.record.ground)),
  }));
  const faults = yield* Effect.forEach(figures, (f) =>
    sheetFault(f, used.get(f.figure.name) ?? new Set()),
  );
  const faulty = faults.flatMap(Option.toArray);
  return {
    palette: cells.map((c) =>
      one(`${c.f.figure.member}/${c.key}`, paletteShare(c.raster, c.f.paints)),
    ),
    pockets: [
      one(
        pockets
          .filter((p) => p.n > 0)
          .map((p) => `${p.at} ${p.n}`)
          .join(', ') || `${pockets.length} cells`,
        pockets.reduce((sum, p) => sum + p.n, 0),
      ),
    ],
    proportions: figures.flatMap((f) =>
      proportionSamples(
        f.figure.member,
        f.record.cells.map((c) => ({
          key: c.key,
          lines: Option.flatten(Option.fromUndefinedOr(f.lines.get(c.key))),
        })),
        f.paints,
      ),
    ),
    oneSheet: [one(faulty.join('; ') || `${figures.length} figures`, faulty.length)],
  };
});

/** The git head the run's code is at. */
const gitHead = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const head = yield* spawner.string(
    ChildProcess.make('git', ['-C', import.meta.dir, 'rev-parse', 'HEAD'], {
      forceKillAfter: '5 seconds',
    }),
  );
  return head.trim();
});

/** Paper behind the contact sheet. */
const CONTACT_PAPER = { r: 253, g: 247, b: 229, alpha: 1 };

/** contact.png: twelve of the run's frames, evenly spaced, at a quarter size, four to a row. */
const contactSheet = Effect.fn('StorybookVerify.contactSheet')(function* (
  shot: Shot,
  planned: ReadonlyArray<PlannedFrame>,
  out: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const [w, h] = [Math.round(shot.size.width / 4), Math.round(shot.size.height / 4)];
  const picks = Array.from(
    { length: Math.min(12, planned.length) },
    (_, k) => planned[Math.floor((k * planned.length) / Math.min(12, planned.length))],
  ).flatMap((p) => Option.toArray(Option.fromUndefinedOr(p)));
  const tiles = yield* Effect.forEach(picks, (p, k) =>
    Effect.tryPromise({
      try: () =>
        sharp(`${out}/frames/${frameName(p.index)}`)
          .resize(w, h)
          .png()
          .toBuffer(),
      catch: (cause) => StorybookFailed.make({ reason: String(cause) }),
    }).pipe(Effect.map((input) => ({ input, left: (k % 4) * w, top: Math.floor(k / 4) * h }))),
  );
  const png = yield* Effect.tryPromise({
    try: () =>
      sharp({
        create: {
          width: w * 4,
          height: h * Math.max(1, Math.ceil(picks.length / 4)),
          channels: 4,
          background: CONTACT_PAPER,
        },
      })
        .composite(tiles)
        .png()
        .toBuffer(),
    catch: (cause) => StorybookFailed.make({ reason: String(cause) }),
  });
  yield* fs.writeFile(`${out}/contact.png`, png);
});

/** One info line per figure: its sheet, and whether the owner kept it. */
const infoOf = (figures: ReadonlyArray<StoredFigure>): ReadonlyArray<string> =>
  figures.map((f) =>
    Option.match(Option.fromUndefinedOr(f.record.kept), {
      onNone: () =>
        `${f.figure.name}: ${f.figure.member}/shot-sheets/${f.figure.sheet}, not yet kept by the owner`,
      onSome: (k) =>
        `${f.figure.name}: ${f.figure.member}/shot-sheets/${f.figure.sheet}, kept by the owner on ${k.date} (ask ${k.ask})`,
    }),
  );

/**
 * One verify run of `shot`: render every `every`-th frame (colour and each
 * figure alone) in one page launch, again in a second, measure, judge every
 * bar, and write `verdict.md`, `verdict.json`, `manifest.json`,
 * `contact.png`, `shot.mp4`, `frames/` and `figures/` under `out`.
 */
export const verifyShot = Effect.fn('StorybookVerify.verifyShot')(function* (
  shot: Shot,
  out: string,
  every: number,
) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.remove(out, { recursive: true, force: true });
  yield* fs.makeDirectory(out, { recursive: true });
  const { figures, heads, scene } = yield* loadShot(shot);
  const planned = timesOf(shot)
    .map((t, index) => ({ index, t }))
    .filter((p) => p.index % every === 0)
    .map((p) => ({ index: p.index, frame: frameAt(shot, heads, p.t) }));
  const first = yield* Effect.scoped(
    Effect.flatMap(storybookPage(scene), (render) =>
      firstLaunch(shot, render, planned, figures, out),
    ),
  );
  const second = yield* Effect.scoped(
    Effect.flatMap(storybookPage(scene), (render) =>
      launch(render, planned, figures, () => Effect.void),
    ),
  );
  const differing = first.hashes.filter((h, k) => h !== second[k]).length;
  const used = usedCells(planned);
  const stores = yield* storeMeasures(figures, used);
  const measured: Measured = {
    palette: stores.palette,
    pockets: stores.pockets,
    'colour-step': stepSamples(first.reads),
    proportions: stores.proportions,
    scale: scaleSamples(
      planned,
      figures.map((f) => ({ name: f.figure.name, z: f.layer.z, heads: f.heads })),
      leadOf(figures),
    ),
    'one-sheet': stores.oneSheet,
    light: lightSamples(first.reads),
    'render-height': heightSamples(first.reads),
    determinism: [
      one(
        `${first.hashes.length} renders, two launches`,
        differing + Math.abs(first.hashes.length - second.length),
      ),
    ],
  };
  const verdict: Verdict = verdictOf(BARS, measured);
  const manifest = yield* Schema.encodeEffect(ManifestJson)({
    shot: shot.id,
    head: yield* gitHead,
    figures: figures.map((f) => ({
      name: f.figure.name,
      member: f.figure.member,
      sheet: f.figure.sheet,
      sha256: f.record.sheet,
    })),
    cells: Object.fromEntries(
      figures.flatMap((f) => f.record.cells.map((c) => [`${f.figure.member}/${c.key}`, c.sha256])),
    ),
    frames: Object.fromEntries(first.colour),
    set: platesOf(shot).map((p) => ({ file: p.file, testArt: p.testArt })),
  });
  yield* fs.writeFileString(`${out}/verdict.md`, verdictText(verdict, infoOf(figures)));
  yield* fs.writeFileString(
    `${out}/verdict.json`,
    `${yield* Schema.encodeEffect(VerdictJson)(verdict)}\n`,
  );
  yield* fs.writeFileString(`${out}/manifest.json`, `${manifest}\n`);
  yield* contactSheet(shot, planned, out);
  yield* encodeClip(`${out}/frames`, shot.fps / every, `${out}/shot.mp4`);
  return { verdict, info: infoOf(figures) };
});
