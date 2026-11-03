// The cast build's stages for one member, from his coverage manifest:
//
//   drawing:<id>  every entry: the drawing's bytes; waits on the owner while
//                 it is not drawn or not kept (the kept fact is its config).
//   parts:<id>    a puppet entry not fitted from another: `concept parts
//                 --check`, else `--reuse`, else (spending okra) a call; its
//                 output lists every file of its sheet folder by hash.
//   cut:<id>      the puppet spec its sheet folder's parts are posed by
//                 (`PUPPETS[<sheet>]` of the member's `cutout/puppets.ts`),
//                 its PNG paths relative to his folder, with the parts'
//                 output hash; it reads every `cutout/*.ts` of the member
//                 and the library's `cutout/puppets.ts`.
//   fit:<id>      every puppet entry: `concept render --figure cutout
//                 --fit-only` of that view, its fit rows; it reads the cut
//                 it is posed with (its `fitted` entry's, else its own) and
//                 its drawing; a fitted entry also reads every file the
//                 member's `cutout/poses.ts` imports (its pose JSON, held
//                 drawings).
//
// Each stage also reads the source files of its kind (`sources.ts`).
//   renders:<id>  a puppet entry cut from its own sheet: its synthetic
//                 training renders, one shard (`renders.ts`); it reads its
//                 cut. An entry fitted with another view's cut has none.
//
// A stage id reads `<stage>:<entry>@<member>` (`cut:turnaround-front@lead-feast`).
// After every member's stages: `trainsetStage`, the sorted hashes of every
// trainable drawing's shard after this build's stages; `trainStage`, the one reader trained on that set (spending
// Modal), keyed by the set, its shards and the reader's source files;
// `evalStage` per shard, that drawing's held samples read and scored by the
// reader (`reader.ts`, on this machine); then `lock.ts`'s lock stage writes
// the reader lock from those outputs. The owner's ask and draws are
// `owner-ask.ts`'s.

import * as Command from 'effect/cli/Command';
import {
  DateTime,
  Effect,
  Equal,
  FileSystem,
  Option,
  Path,
  Predicate,
  Schema,
  type Scope,
  Struct,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import type { PuppetSpec } from '../../canvas/puppet.ts';
import type { PuppetImages } from '../../puppet/images.ts';
import { puppetFrom } from '../../puppet/load.ts';
import { renderCast } from '../cast-render.ts';
import { sha256Hex } from '../digest.ts';
import { FilmFolder, type FilmName, importFilmModule } from '../film-repo.ts';
import type { Media } from '../media.ts';
import { parts } from '../part-sheet-cli.ts';
import { ChainFailed, chainOf } from './chain.ts';
import { type Band, CHAIN, ClipReadJson } from './chain-steps.ts';
import {
  ClipFigureJson,
  MAPPING,
  clipFrames,
  declaredBands,
  provenanceIn,
  writeCanvases,
} from './clip-eval.ts';
import type { ClipMap } from './clip-map.ts';
import { ClipLock, clipEntryOf } from './clips.ts';
import { type Coverage, type EntryFacts, coverageOf } from './coverage.ts';
import { barsOfRecord, sheetOf } from './coverage-facts.ts';
import {
  type Input,
  type Stage,
  type StageContext,
  StageFailed,
  WaitingOwner,
  fileInput,
  optionalInput,
  stageInput,
} from './graph.ts';
import { CastReader, type ReaderError } from './reader.ts';
import { SAMPLES, shardOf, trainsetOf } from './renders.ts';
import {
  cutTableSources,
  cutterSources,
  filmCastSources,
  pageSources,
  stageSources,
} from './sources.ts';

/** Bumped when a stage's code makes other bytes from the same inputs. */
const VERSION = {
  drawing: '1',
  parts: '2',
  cut: '2',
  fit: '1',
  renders: '1',
  status: '2',
  trainset: '2',
  train: '2',
  eval: '1',
  chain: '2',
} as const;

/**
 * The reader's train: steps, batch, learning rate, seed, GPU, precision, its
 * backbone and the input it reads (width and height in px); a fixed step
 * count, no wall-clock stop. The train hands the backbone and input to
 * Modal, and the checkpoint keeps them for every read; these are
 * `reader/model.py`'s defaults (`BACKBONE`, `IN_W, IN_H`), held equal by
 * `reader.test.ts`.
 */
export const TRAIN = {
  steps: 4800,
  batch: 32,
  lr: 1e-3,
  seed: 0,
  gpu: 'L4',
  precision: 'bf16',
  backbone: 'facebook/dinov2-small',
  inputSide: { width: 448, height: 560 },
} as const;
/** A train's cost in USD as the build counts it: S7b's measured $0.9229; Modal's billing holds the real figure. */
const TRAIN_USD = 0.92;

const encoder = new TextEncoder();

/** Every file under `dir`, by its path from `dir`, sorted; none when `dir` is missing. */
const filesUnder = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const names = yield* fs
      .readDirectory(dir, { recursive: true })
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
    const files: Array<string> = [];
    for (const name of [...names].toSorted()) {
      const info = yield* fs.stat(path.join(dir, name));
      if (info.type === 'File') files.push(name);
    }
    return files;
  });

/**
 * A parts stage's output: each file of its sheet folder by its path from the
 * folder and its bytes' hash (`name=hash`, sorted), and its record's text
 * (`record.json`, null while the sheet has none), which its bars are read from.
 */
const PartsJson = Schema.fromJsonString(
  Schema.Struct({
    files: Schema.Array(Schema.String),
    record: Schema.optionalKey(Schema.String),
  }),
);
const encodeParts = (parts: typeof PartsJson.Type) =>
  Schema.encodeEffect(PartsJson)(parts).pipe(
    Effect.map((t) => encoder.encode(t)),
    Effect.mapError((e) => StageFailed.make({ reason: `parts output: ${String(e)}` })),
  );

const partsOutput = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const names = yield* filesUnder(dir);
    const files: Array<string> = [];
    for (const name of names)
      files.push(`${name}=${sha256Hex(yield* fs.readFile(path.join(dir, name)))}`);
    const records = yield* Effect.forEach(
      names.filter((n) => n === 'record.json'),
      (n) => fs.readFileString(path.join(dir, n)),
    );
    return yield* encodeParts(
      Option.match(Option.fromUndefinedOr(records[0]), {
        onNone: () => ({ files }),
        onSome: (record) => ({ files, record }),
      }),
    );
  }).pipe(Effect.mapError((e) => StageFailed.make({ reason: `parts ${dir}: ${String(e)}` })));

const SpecJson = Schema.fromJsonString(Schema.Unknown);
const ConfigJson = Schema.fromJsonString(Schema.Unknown);
const ClipLockJson = Schema.fromJsonString(ClipLock);
/** A renders stage's settings: how many samples of each split. */
const RENDERS_CONFIG = Schema.encodeSync(ConfigJson)(SAMPLES);
/** The train settings as text, as its key and its run read them. */
const TRAIN_CONFIG = Schema.encodeSync(ConfigJson)(TRAIN);
const PuppetsModule = Schema.Struct({ PUPPETS: Schema.Record(Schema.String, Schema.Unknown) });

/** The member's cutout sources a puppet spec is built from: every `cutout/*.ts` of his, and the library's `cutout/puppets.ts`. */
const specSources = (memberDir: string, libraryPuppets: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cutout = path.join(memberDir, 'cutout');
    const names = yield* fs.readDirectory(cutout).pipe(Effect.orElseSucceed(() => []));
    return [
      ...names
        .filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))
        .toSorted()
        .map((n) => path.join(cutout, n)),
      libraryPuppets,
    ];
  });

/**
 * The files the member's fitted poses are made from: every file his
 * `cutout/poses.ts` imports other than a module (the fitted pose JSON, a held
 * drawing), which the fit render reads through that module.
 */
const fittedFiles = (memberDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const poses = path.join(memberDir, 'cutout', 'poses.ts');
    const text = yield* fs.readFileString(poses).pipe(Effect.orElseSucceed(() => ''));
    return [...text.matchAll(/from '(\.[^']+)'/g)]
      .flatMap((match) => match.slice(1))
      .filter((spec) => !spec.endsWith('.ts'))
      .map((spec) => path.join(path.dirname(poses), spec))
      .toSorted();
  });

/** A command's run, its error read as the stage's failure. */
const runParts = (film: FilmName, member: string, view: string, flags: ReadonlyArray<string>) =>
  Command.runWith(parts, { version: 'build' })([film, member, '--view', view, ...flags]);

/** A member's own cutter (`Coverage.cutters`), run with bun; a run that fails or exits nonzero fails the stage. */
const runCutter = (script: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const code = yield* spawner
      .exitCode(ChildProcess.make('bun', [script], { forceKillAfter: '5 seconds' }))
      .pipe(Effect.mapError((e) => StageFailed.make({ reason: `${script}: ${e.message}` })));
    if (code !== 0) return yield* StageFailed.make({ reason: `${script} exited ${code}` });
  });

/** `entry`'s puppet spec, as the member's `cutout/puppets.ts` declares it (`PUPPETS[<sheet>]`). */
const puppetSpecIn = (memberDir: string, entry: Coverage['entries'][number]) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const loaded = yield* Effect.tryPromise(() =>
      importFilmModule(path.join(memberDir, 'cutout', 'puppets.ts')),
    );
    const module = yield* Schema.decodeUnknownEffect(PuppetsModule)(loaded);
    return yield* Effect.fromOption(Option.fromNullishOr(module.PUPPETS[sheetOf(entry)])).pipe(
      Effect.mapError(() => `cutout/puppets.ts has no puppet ${sheetOf(entry)}`),
    );
  });

/** A puppets module's value read as a puppet spec: its key, size, parts and skeleton are there. */
const isPuppetSpec = (u: unknown): u is PuppetSpec =>
  Predicate.hasProperty(u, 'key') &&
  Predicate.hasProperty(u, 'size') &&
  Predicate.hasProperty(u, 'skeleton') &&
  Predicate.hasProperty(u, 'parts') &&
  Array.isArray(u.parts);

/** What the stages run on: the files, `concept parts`, the fit render and the puppets' part PNGs. */
export type StageServices =
  | FileSystem.FileSystem
  | Path.Path
  | PuppetImages
  | Effect.Services<ReturnType<typeof runParts>>
  | ChildProcessSpawner.ChildProcessSpawner
  | Exclude<Effect.Services<ReturnType<typeof renderCast>>, Scope.Scope>;

export interface MemberStages {
  readonly film: FilmName;
  readonly member: string;
  readonly memberDir: string;
  /** The library's `cutout/puppets.ts`, which every member's puppets are built through. */
  readonly libraryPuppets: string;
  readonly coverage: Coverage;
  readonly facts: Readonly<Record<string, EntryFacts>>;
}

/** The code every member's stages are keyed by: each stage kind's sources, the film's cast module's and the render page's (`buildSources`). */
interface BuildSources {
  readonly stage: Effect.Success<typeof stageSources>;
  readonly filmCast: ReadonlyArray<Input>;
  /** The render page the fit draws in: its HTML and its scripts' closure. */
  readonly page: ReadonlyArray<Input>;
}

/**
 * The film's build sources, read once per build: each stage kind's import
 * closure, its `rigs/cast.ts`'s, and the closure of `page`, the render page
 * the fit draws in (the CLI's, the app's `RENDER_PAGE`).
 */
export const buildSources = Effect.fn('cast.build.sources')(function* (
  film: FilmName,
  page: string,
) {
  const stage = yield* stageSources;
  // the fit render loads the film's cast module by its path (`STAGE_LOADS`)
  const filmCast = yield* filmCastSources((yield* FilmFolder).paths(film).dir);
  return { stage, filmCast, page: yield* pageSources(page) } satisfies BuildSources;
});

/** One member's stages, in the order they build, keyed by the build's sources. */
export const memberStages = Effect.fn('cast.build.memberStages')(function* (
  m: MemberStages,
  built: BuildSources,
) {
  const path = yield* Path.Path;
  const sources = yield* specSources(m.memberDir, m.libraryPuppets);
  const src = built.stage;
  /** An entry named in a stage id: `<entry>@<member>`, so `cut:<entry>` leads it and two members never share one. */
  const at = (id: string) => `${id}@${m.member}`;
  const factsOf = (id: string) => Option.fromNullishOr(m.facts[id]);
  const stages: Array<Stage<StageServices>> = [];
  for (const entry of m.coverage.entries) {
    const file = path.join(m.memberDir, entry.file);
    const facts = factsOf(entry.id);
    const drawn = Option.exists(facts, (f) => f.drawn);
    const kept = Option.exists(facts, (f) => f.kept);
    stages.push({
      id: `drawing:${at(entry.id)}`,
      view: entry.id,
      inputs: [fileInput(file)],
      version: VERSION.drawing,
      config: `drawn=${drawn} kept=${kept}`,
      run: (ctx) => {
        if (!drawn)
          return Effect.fail(WaitingOwner.make({ reason: `${at(entry.id)} is not drawn` }));
        if (!kept) return Effect.fail(WaitingOwner.make({ reason: `${at(entry.id)} is not kept` }));
        return ctx.file(file);
      },
    });
  }
  // his part sheets are made by his own cutters, with no repaint, or by `concept parts` from his
  // cut table, which asks okra only for a view with no answer drawn
  const cutters = Option.map(Option.fromUndefinedOr(m.coverage.cutters), (scripts) =>
    scripts.map((s) => path.join(m.memberDir, s)),
  );
  const maker = yield* Option.match(cutters, {
    onNone: () => Effect.map(cutTableSources(m.memberDir), (cut) => [...cut, ...src.parts]),
    onSome: cutterSources,
  });
  for (const entry of m.coverage.entries) {
    if (entry.cut !== 'puppet' || Option.isSome(Option.fromUndefinedOr(entry.fitted))) continue;
    const sheet = path.join(m.memberDir, 'cutout', 'sheets', sheetOf(entry));
    // every file of the sheet folder: its record and part PNGs (which `--check` holds to its
    // answers), and its okra ledger and answers
    const sheetFiles = yield* filesUnder(sheet);
    /** `concept parts` on the view: free when its answers are drawn, else okra under `--spend okra`. */
    const byParts = (ctx: StageContext) =>
      Effect.gen(function* () {
        const free = yield* runParts(m.film, m.member, entry.id, ['--check']).pipe(
          Effect.catch(() => runParts(m.film, m.member, entry.id, ['--reuse'])),
          Effect.option,
        );
        if (Option.isNone(free))
          yield* ctx.spend(
            'okra',
            runParts(m.film, m.member, entry.id, []).pipe(
              Effect.mapError((e) =>
                StageFailed.make({ reason: `concept parts ${entry.id}: ${String(e)}` }),
              ),
            ),
          );
      });
    stages.push({
      id: `parts:${at(entry.id)}`,
      view: entry.id,
      inputs: [
        stageInput(`drawing:${at(entry.id)}`),
        ...maker,
        ...sheetFiles.map((f) => fileInput(path.join(sheet, f))),
      ],
      version: VERSION.parts,
      run: (ctx) =>
        Effect.gen(function* () {
          yield* Option.match(cutters, {
            onNone: () => byParts(ctx),
            onSome: (scripts) => Effect.forEach(scripts, runCutter, { discard: true }),
          });
          return yield* partsOutput(sheet);
        }),
    });
    stages.push({
      id: `cut:${at(entry.id)}`,
      view: entry.id,
      inputs: [
        stageInput(`parts:${at(entry.id)}`),
        ...sources.map((s): Input => fileInput(s)),
        ...src.cut,
      ],
      version: VERSION.cut,
      run: (ctx) =>
        Effect.gen(function* () {
          const spec = yield* puppetSpecIn(m.memberDir, entry);
          // its PNG paths named from the member's folder, so the spec reads the same in any checkout
          const text = yield* Schema.encodeEffect(SpecJson)(spec);
          return text.replaceAll(`${m.memberDir}/`, '');
        }).pipe(
          Effect.mapError((e) => StageFailed.make({ reason: `cut ${at(entry.id)}: ${String(e)}` })),
          // the puppet is its spec and its part PNGs' bytes: a repainted part changes the cut,
          // so its fits rerun
          Effect.flatMap((spec) =>
            Effect.map(ctx.output(`parts:${at(entry.id)}`), (parts) =>
              encoder.encode(`${spec}\n${new TextDecoder().decode(parts)}`),
            ),
          ),
        ),
    });
  }
  const fitted = yield* fittedFiles(m.memberDir);
  const { filmCast, page } = built;
  for (const entry of m.coverage.entries) {
    if (entry.cut !== 'puppet') continue;
    const cut = `cut:${at(entry.fitted ?? entry.id)}`;
    stages.push({
      id: `fit:${at(entry.id)}`,
      view: entry.id,
      inputs: [
        stageInput(cut),
        stageInput(`drawing:${at(entry.id)}`),
        ...src.fit,
        ...page,
        ...filmCast,
        // a fitted pose is its pose JSON and held drawings too, which its cut does not hash
        ...Option.match(Option.fromUndefinedOr(entry.fitted), {
          onNone: () => [],
          onSome: () => fitted.map(fileInput),
        }),
      ],
      version: VERSION.fit,
      run: () =>
        Effect.scoped(
          renderCast(m.film, m.member, {
            kinds: [],
            views: [entry.id],
            critique: false,
            fitOnly: true,
            figure: 'cutout',
          }),
        ).pipe(
          Effect.flatMap((made) =>
            Schema.encodeEffect(FitJson)(
              made.render.views.map((v) => ({
                view: `${v.kind}-${v.view}`,
                rows: (v.fit ?? []).map((r) => ({ name: String(r.name), pass: r.pass })),
              })),
            ),
          ),
          Effect.map((text) => encoder.encode(text)),
          Effect.mapError((e) => StageFailed.make({ reason: `fit ${at(entry.id)}: ${String(e)}` })),
        ),
    });
  }
  for (const entry of m.coverage.entries) {
    // a drawing cut from its own sheet, once its cut is made (in this build or before); the
    // training set takes it only when its entry is trainable (`trainsetStage`)
    if (entry.cut !== 'puppet' || Option.isSome(Option.fromUndefinedOr(entry.fitted))) continue;
    stages.push({
      id: `renders:${at(entry.id)}`,
      view: entry.id,
      inputs: [stageInput(`cut:${at(entry.id)}`), ...src.renders],
      version: VERSION.renders,
      config: RENDERS_CONFIG,
      run: () =>
        Effect.gen(function* () {
          const spec = yield* puppetSpecIn(m.memberDir, entry);
          if (!isPuppetSpec(spec)) return yield* Effect.fail('its puppet spec has no parts');
          const paper = yield* Effect.fromOption(Option.fromUndefinedOr(spec.paper)).pipe(
            Effect.mapError(() => `puppet ${spec.key} names no paper`),
          );
          const puppet = yield* puppetFrom(spec);
          return shardOf({ puppet, paper }, m.member, entry.id);
        }).pipe(
          Effect.mapError((e) =>
            StageFailed.make({ reason: `renders ${at(entry.id)}: ${String(e)}` }),
          ),
        ),
    });
    stages.push(statusStage(entry.id, m.member));
  }
  return stages;
});

/** The ids of an entry's stages, `<kind>:<entry>@<member>`. */
const idsOf = (entry: string, member: string) => {
  const at = (kind: string) => `${kind}:${entry}@${member}`;
  return {
    drawing: at('drawing'),
    parts: at('parts'),
    cut: at('cut'),
    fit: at('fit'),
    renders: at('renders'),
    status: at('status'),
  };
};

const StatusJson = Schema.fromJsonString(
  Schema.Struct({
    complete: Schema.Boolean,
    trainable: Schema.Boolean,
    missing: Schema.Array(Schema.String),
  }),
);

/**
 * An entry's coverage verdicts, `coverageOf` over facts read off this
 * build's outputs: drawn and kept, its drawing stage made (it fails
 * otherwise); bars, its parts output's record; cut, its cut made; fit, its
 * fit rows pass. It says `complete` (the library's readiness) and
 * `trainable` (the training set takes it). Its inputs are those stages, so
 * a record whose bars change changes the verdicts and every key that reads
 * them.
 */
const statusStage = (entry: string, member: string): Stage<never> => {
  const ids = idsOf(entry, member);
  return {
    id: ids.status,
    view: entry,
    inputs: [
      stageInput(ids.drawing),
      stageInput(ids.parts),
      stageInput(ids.cut),
      stageInput(ids.fit),
    ],
    version: VERSION.status,
    run: (ctx) =>
      Effect.gen(function* () {
        const parts = yield* Schema.decodeEffect(PartsJson)(
          new TextDecoder().decode(yield* ctx.output(ids.parts)),
        ).pipe(Effect.option);
        const bars = yield* barsOfRecord(
          Option.flatMap(parts, (p) => Option.fromUndefinedOr(p.record)),
        );
        const fit = yield* fitPasses(yield* ctx.output(ids.fit));
        const report = coverageOf(
          { member, entries: [{ id: entry, cut: 'puppet' }] },
          { [entry]: { drawn: true, kept: true, cut: true, bars, fit } },
        );
        const missing = report.entries.flatMap((e) => e.missing);
        const text = yield* Schema.encodeEffect(StatusJson)({
          complete: report.complete,
          trainable: report.entries.every((e) => e.trainable),
          missing,
        });
        return encoder.encode(text);
      }).pipe(Effect.mapError((e) => StageFailed.make({ reason: `${ids.status}: ${String(e)}` }))),
  };
};

/** Whether a status stage's output says its entry is trainable. */
const trainableIn = (bytes: Uint8Array) =>
  Schema.decodeEffect(StatusJson)(new TextDecoder().decode(bytes)).pipe(
    Effect.map((s) => s.trainable),
    Effect.orElseSucceed(() => false),
  );

/**
 * A drawing that may join the training set: a puppet entry cut from its own
 * sheet, with its renders and status stages.
 */
export interface Candidate {
  /** `<member>/<entry>`. */
  readonly drawing: string;
  readonly renders: string;
  readonly status: string;
}

/** An entry's candidate: `<member>/<entry>` and its renders and status stage ids. */
const candidateOf = (entry: string, member: string): Candidate => {
  const ids = idsOf(entry, member);
  return { drawing: `${member}/${entry}`, renders: ids.renders, status: ids.status };
};

/** A member's candidates for the training set, one per puppet entry cut from its own sheet. */
export const candidatesOf = (m: MemberStages): ReadonlyArray<Candidate> =>
  m.coverage.entries
    .filter((e) => e.cut === 'puppet' && Option.isNone(Option.fromUndefinedOr(e.fitted)))
    .map((e) => candidateOf(e.id, m.member));

/** Whether a fit stage's output passes: every row of every view it fit. */
export const fitPasses = (bytes: Uint8Array) =>
  Schema.decodeEffect(FitJson)(new TextDecoder().decode(bytes)).pipe(
    Effect.map((views) => views.length > 0 && views.every((v) => v.rows.every((r) => r.pass))),
    Effect.orElseSucceed(() => false),
  );

/**
 * The training set: the shard hash of every candidate whose status stage
 * says trainable (`coverage.ts`: drawn, kept, cut, fit passed; its bars do
 * not count), by its drawing, sorted. Its renders and status are optional
 * inputs, so the set is keyed by every eligibility fact through those
 * outputs; a drawing that waits (its sheet not yet cut) leaves the set
 * without holding it, and one made trainable in this build joins it. A
 * fitted entry is no candidate, so it yields no shard.
 */
export const trainsetStage = (candidates: ReadonlyArray<Candidate>): Stage<never> => ({
  id: 'trainset',
  inputs: candidates.flatMap((c) => [optionalInput(c.renders), optionalInput(c.status)]),
  version: VERSION.trainset,
  run: (ctx) =>
    Effect.gen(function* () {
      const shards: Array<readonly [string, string]> = [];
      for (const c of candidates) {
        if (!ctx.known(c.renders) || !ctx.known(c.status)) continue;
        if (yield* trainableIn(yield* ctx.output(c.status)))
          shards.push([c.drawing, sha256Hex(yield* ctx.output(c.renders))]);
      }
      return trainsetOf(Object.fromEntries(shards));
    }),
});

/** The drawings in a training set's output, `<member>/<entry>=<hash>` lines. */
const drawingsIn = (trainset: Uint8Array) =>
  new TextDecoder()
    .decode(trainset)
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => line.slice(0, line.lastIndexOf('=')));

/** A reader error as the stage's failure. */
const readerFailed = (id: string) => (e: ReaderError) =>
  StageFailed.make({ reason: `${id}: ${e.message}` });

/**
 * The training set read by the train stage: its bytes, its hash, the train
 * files' hashes by basename (`trainer`), and the reader's key over the set,
 * the config and those files (`trainFiles`, the reader's `train` role). The
 * key names each file by its basename, sorted, so it holds across checkouts.
 */
export const trainKeyOf = (ctx: StageContext, trainFiles: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const set = yield* ctx.output('trainset');
    const trainset = sha256Hex(set);
    const hashes = new Map<string, string>();
    for (const file of trainFiles)
      hashes.set(file.split('/').at(-1) ?? file, sha256Hex(yield* ctx.file(file)));
    const trainer = [...hashes.keys()]
      .toSorted()
      .map((name) => [name, hashes.get(name) ?? ''] as const);
    const lines = [
      `trainset=${trainset}`,
      `config=${TRAIN_CONFIG}`,
      ...trainer.map(([name, sha]) => `${name}=${sha}`),
    ];
    return {
      set,
      trainset,
      trainer: Object.fromEntries(trainer),
      key: sha256Hex(encoder.encode(lines.join('\n'))),
    };
  });

/** The part of train.py's result the train notes: its steps, seconds per step and last loss. */
const FitResult = Schema.fromJsonString(
  Schema.Struct({ steps: Schema.Finite, sec_per_step: Schema.Finite, last_loss: Schema.Finite }),
);

/** A train's fit summary, as the train stage notes it in `build.json` and the lock reads it. */
export const FitNote = Schema.fromJsonString(
  Schema.Struct({
    trainedOn: Schema.String,
    modalApp: Schema.optionalKey(Schema.String),
    steps: Schema.Finite,
    secPerStep: Schema.Finite,
    finalLoss: Schema.Finite,
  }),
);

/** The train's lines of the reader lock: its fit summary, when it noted one, and the stage's wall time. */
export const TrainLines = Schema.Struct({
  trainedOn: Schema.optionalKey(Schema.String),
  modalApp: Schema.optionalKey(Schema.String),
  steps: Schema.optionalKey(Schema.Finite),
  secPerStep: Schema.optionalKey(Schema.Finite),
  trainSec: Schema.optionalKey(Schema.Finite),
  finalLoss: Schema.optionalKey(Schema.Finite),
  stageSec: Schema.Finite,
});

/** The USD the build counted for the train, as the reader lock keeps it. */
export const BuildSpend = Schema.Struct({ buildCountedUsd: Schema.Finite });

/** What a train that adopted the committed checkpoint notes: the lock's train lines and spend, which the lock keeps as they are. */
export const AdoptedNote = Schema.fromJsonString(
  Schema.Struct({
    adopted: Schema.Struct({ train: TrainLines, spend: Schema.optionalKey(BuildSpend) }),
  }),
);

/** A spread of the median and the 90th percentile. */
export const Spread = Schema.Struct({ median: Schema.Finite, p90: Schema.Finite });

/** The part of an eval's output (eval.py's JSON) the lock reads: the trained drawing's held samples, or the untrained one's; eval.py writes `null` for the side it has no samples on. */
export const EvalJson = Schema.fromJsonString(
  Schema.Struct({
    seen: Schema.optionalKey(
      Schema.NullOr(
        Schema.Struct({
          n: Schema.Finite,
          accuracy: Schema.Finite,
          angle_deg: Spread,
          joint_px: Spread,
        }),
      ),
    ),
    unseen: Schema.optionalKey(
      Schema.NullOr(Schema.Struct({ n: Schema.Finite, angle_deg: Spread, joint_px: Spread })),
    ),
  }),
);

/** A trained drawing's held line, as the lock keeps it (`held.byDrawing`). */
export const HeldLine = Schema.Struct({
  n: Schema.Finite,
  accuracy: Schema.Finite,
  angleDeg: Spread,
  jointPx: Spread,
});

/**
 * The part of the committed reader lock a train reads (extra keys ignored):
 * to adopt its checkpoint, its key, checkpoint, train lines and spend; to
 * name what changed, its `trainer`; to keep it across a key change
 * (`--keep-reader`), its set, config and held lines. A lock older than a
 * field has none of it.
 */
const CommittedLock = Schema.fromJsonString(
  Schema.Struct({
    reader: Schema.String,
    trainer: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    trainset: Schema.optionalKey(Schema.String),
    config: Schema.optionalKey(Schema.Unknown),
    checkpointSha256: Schema.String,
    train: TrainLines,
    held: Schema.optionalKey(Schema.Struct({ byDrawing: Schema.Record(Schema.String, HeldLine) })),
    spend: Schema.optionalKey(BuildSpend),
  }),
);
type Committed = typeof CommittedLock.Type;

/**
 * Each field of a held line that differs between `was` (the lock's) and
 * `now` (eval.py's numbers for the same drawing), by its lock name: exact
 * equality, as eval.py rounds them; none when they are the same.
 */
const heldDiffs = (
  was: typeof HeldLine.Type,
  now: Option.Option<NonNullable<(typeof EvalJson.Type)['seen']>>,
): ReadonlyArray<string> =>
  Option.match(now, {
    onNone: () => ['no held samples'],
    onSome: (s) =>
      [
        ['n', was.n, s.n],
        ['accuracy', was.accuracy, s.accuracy],
        ['angleDeg.median', was.angleDeg.median, s.angle_deg.median],
        ['angleDeg.p90', was.angleDeg.p90, s.angle_deg.p90],
        ['jointPx.median', was.jointPx.median, s.joint_px.median],
        ['jointPx.p90', was.jointPx.p90, s.joint_px.p90],
      ]
        .filter(([, a, b]) => a !== b)
        .map(([field, a, b]) => `${field} ${a} -> ${b}`),
  });

/** The fit summary of a train whose result is `result` (train.py's JSON), run in Modal app `app`, today. */
const fitNote = (result: string, app: Option.Option<string>) =>
  Effect.gen(function* () {
    const fit = yield* Schema.decodeEffect(FitResult)(result);
    return yield* Schema.encodeEffect(FitNote)({
      trainedOn: DateTime.formatIsoDateUtc(yield* DateTime.now),
      ...Option.match(app, { onNone: () => ({}), onSome: (modalApp) => ({ modalApp }) }),
      steps: fit.steps,
      secPerStep: fit.sec_per_step,
      finalLoss: fit.last_loss,
    });
  });

/**
 * The one reader trained on the training set, on Modal; it spends, so it
 * waits unless `--spend modal`. It reads the set, every shard in it and
 * the reader's train files (`trainFiles`, the closure of what a train runs,
 * `CastReader.sources.train`), so a change to any of them is a new reader;
 * a read-only or eval-only file is not among them. Its output is the checkpoint, with
 * the fit's summary (`FitNote`) noted beside it in `build.json`; on
 * Modal the train writes it at `/runs/<key>/<the build's run>.pt`, and
 * `promote` copies it to `/readers/<key>.pt` (the key: the hash of those
 * inputs and the config) only while the build's mark holds the stage's key,
 * so a train fenced by another build's never overwrites the key's checkpoint.
 *
 * Before it spends, it adopts the committed checkpoint: when its reader key
 * is the committed lock's (`lock`) `reader` and the cache keeps the object
 * the lock names, its bytes hashing to that name, it returns those bytes
 * and notes the lock's train lines and spend (`AdoptedNote`), with no Modal
 * call; that checkpoint is already the key's on Modal, so its promote does
 * nothing. A stage key that moves while the reader's does not (a change in
 * how the build keys its inputs) so costs nothing.
 *
 * When the lock names another reader key, it trains (so waits on the
 * spend) and logs the train files, set or config that changed since the
 * lock. With `keepReader` (`--keep-reader`: the claim that the edit leaves
 * what a train makes as it is) it instead keeps the committed checkpoint
 * (`keep`), or fails; it never trains. The flag is in no key.
 */
export const trainStage = (
  candidates: ReadonlyArray<Candidate>,
  trainFiles: ReadonlyArray<string>,
  lock: string,
  o: { readonly keepReader: boolean } = { keepReader: false },
): Stage<CastReader | FileSystem.FileSystem> => {
  /** This process's runs that adopted rather than trained: they have nothing to promote. */
  const adopted = new Set<string>();
  const trainOn = trainOnModal(candidates, trainFiles);
  /** The committed lock, when there is one that decodes. */
  const committedOf = (ctx: StageContext) =>
    Effect.gen(function* () {
      const text = yield* ctx.file(lock).pipe(Effect.option);
      return yield* Effect.option(
        Effect.flatMap(Effect.fromOption(text), (bytes) =>
          Schema.decodeEffect(CommittedLock)(new TextDecoder().decode(bytes)),
        ),
      );
    });
  /** The committed checkpoint `checkpoint` as this run's output: the lock's train lines and spend noted, nothing to promote. */
  const adopt = (
    ctx: StageContext,
    key: string,
    c: Committed,
    checkpoint: Uint8Array,
    how: string,
  ) =>
    Effect.gen(function* () {
      yield* ctx.note(
        yield* Schema.encodeEffect(AdoptedNote)({
          adopted: Struct.pick(c, ['train', 'spend']),
        }).pipe(Effect.orDie),
      );
      yield* Effect.log(
        `cast.build.train adopted${how} reader=${key} checkpoint=${c.checkpointSha256}`,
      );
      adopted.add(ctx.run);
      return checkpoint;
    });
  const refused = (why: string) => StageFailed.make({ reason: `train: --keep-reader: ${why}` });
  /**
   * The committed checkpoint kept across a key change: only when the lock's
   * set is this set, its config this config, its checkpoint in the cache,
   * and every drawing of its held set, read by that checkpoint under this
   * code (the eval stages' path, on this machine's CPU), scores exactly the
   * lock's held line (`heldDiffs`). Anything else fails, naming why (each
   * differing drawing and field); a failed stage is not cached.
   */
  const keep = (
    ctx: StageContext,
    t: Effect.Success<ReturnType<typeof trainKeyOf>>,
    c: Committed,
  ) =>
    Effect.gen(function* () {
      if (c.trainset !== t.trainset)
        return yield* refused(
          `the training set changed (lock ${c.trainset ?? 'none'}, this build ${t.trainset})`,
        );
      if (!Equal.equals(c.config, TRAIN))
        return yield* refused("the train config is not the lock's");
      const held = c.held?.byDrawing ?? {};
      const drawings = Object.keys(held).toSorted();
      if (!Equal.equals(drawings, drawingsIn(t.set).toSorted()))
        return yield* refused("the lock's held drawings are not the training set's");
      const checkpoint = yield* ctx.object(c.checkpointSha256);
      if (Option.isNone(checkpoint))
        return yield* refused(`the checkpoint ${c.checkpointSha256} is not in the cache`);
      const reader = yield* CastReader;
      const fs = yield* FileSystem.FileSystem;
      const renders = new Map(candidates.map((one) => [one.drawing, one.renders]));
      const diffs = yield* Effect.scoped(
        Effect.gen(function* () {
          const ckpt = `${yield* fs.makeTempDirectoryScoped()}/checkpoint.pt`;
          yield* fs.writeFile(ckpt, checkpoint.value);
          const out: Array<string> = [];
          for (const [drawing, was] of Object.entries(held).toSorted(([a], [b]) =>
            a.localeCompare(b),
          )) {
            const shard = yield* ctx.outputPath(renders.get(drawing) ?? `renders:${drawing}`);
            const scored = yield* reader
              .evaluate(ckpt, shard)
              .pipe(Effect.mapError(readerFailed('train --keep-reader')));
            const now = yield* Schema.decodeEffect(EvalJson)(scored).pipe(
              Effect.mapError((e) => refused(`${drawing}'s eval: ${e.message}`)),
            );
            for (const diff of heldDiffs(was, Option.fromNullishOr(now.seen)))
              out.push(`${drawing} ${diff}`);
          }
          return out;
        }),
      ).pipe(Effect.catchTag('PlatformError', (e) => Effect.fail(refused(e.message))));
      if (diffs.length > 0)
        return yield* refused(
          `the committed checkpoint reads otherwise under this code: ${diffs.join('; ')}`,
        );
      return yield* adopt(
        ctx,
        t.key,
        c,
        checkpoint.value,
        ` (keep-reader: ${drawings.length} held drawings equal)`,
      );
    });
  /** The line a rekeyed train logs: what changed since the lock (its train files by `trainer`, the set, the config) and the keep path. */
  const rekeyedLine = (t: Effect.Success<ReturnType<typeof trainKeyOf>>, c: Committed) => {
    const files = Option.match(Option.fromUndefinedOr(c.trainer), {
      onNone: () => ['the lock names no train files'],
      onSome: (was) =>
        [...new Set([...Object.keys(was), ...Object.keys(t.trainer)])]
          .toSorted()
          .filter((name) => was[name] !== t.trainer[name]),
    });
    const changed = [
      ...files,
      ...['trainset'].filter(() => c.trainset !== t.trainset),
      ...['config'].filter(() => !Equal.equals(c.config, TRAIN)),
    ];
    return `cast.build.train rekeyed reader=${t.key} lock=${c.reader} changed=${changed.join(',')}: it trains (--spend modal); when the edit leaves what a train makes as it is, --keep-reader keeps the committed checkpoint once its held eval reads the same`;
  };
  return {
    id: 'train',
    inputs: [
      // the set names each shard by its hash, so its shards are in its key
      stageInput('trainset'),
      ...trainFiles.map(fileInput),
    ],
    version: VERSION.train,
    config: TRAIN_CONFIG,
    run: (ctx) =>
      Effect.gen(function* () {
        const t = yield* trainKeyOf(ctx, trainFiles);
        const committed = yield* committedOf(ctx);
        if (Option.isSome(committed) && committed.value.reader === t.key) {
          const c = committed.value;
          const checkpoint = yield* ctx.object(c.checkpointSha256);
          if (Option.isSome(checkpoint)) return yield* adopt(ctx, t.key, c, checkpoint.value, '');
          return yield* trainOn(ctx);
        }
        if (o.keepReader)
          return yield* Option.match(committed, {
            onNone: () => Effect.fail(refused(`no committed lock at ${lock}`)),
            onSome: (c) => keep(ctx, t, c),
          });
        if (Option.isSome(committed)) yield* Effect.log(rekeyedLine(t, committed.value));
        return yield* trainOn(ctx);
      }),
    promote: (ctx) =>
      Effect.gen(function* () {
        if (adopted.has(ctx.run)) return;
        const reader = yield* CastReader;
        const { key } = yield* trainKeyOf(ctx, trainFiles);
        yield* reader.promote(key, ctx.run).pipe(Effect.mapError(readerFailed('promote')));
      }),
  };
};

/** The paid train of `candidates` on Modal, when the build allows it. */
const trainOnModal =
  (candidates: ReadonlyArray<Candidate>, trainFiles: ReadonlyArray<string>) =>
  (ctx: StageContext) =>
    ctx.spend(
      'modal',
      Effect.gen(function* () {
        const reader = yield* CastReader;
        const { set, trainset, key } = yield* trainKeyOf(ctx, trainFiles);
        const inSet = new Set(drawingsIn(set));
        const shards = yield* Effect.forEach(
          candidates.filter((c) => inSet.has(c.drawing)).map((c) => c.renders),
          ctx.outputPath,
        );
        const made = yield* reader
          .train({ trainset, key, run: ctx.run, shards, config: TRAIN })
          .pipe(Effect.mapError(readerFailed('train')));
        yield* Effect.log(`cast.build.train result=${made.result}`);
        yield* fitNote(made.result, made.app).pipe(
          Effect.flatMap(ctx.note),
          // a paid train is kept without its summary rather than thrown away
          Effect.catch((e) =>
            Effect.logWarning(`cast.build.train fit-unread reason="${String(e)}"`),
          ),
        );
        return made.checkpoint;
      }),
      TRAIN_USD,
    );

/**
 * One drawing's held samples read by the trained reader and scored, by its
 * renders stage's id. It reads the eval's TS sources (`evalSources`) and the
 * reader's eval files (`evalFiles`, `CastReader.sources.eval`: what a local
 * read and score run), so a read or eval edit re-runs it with the train cached.
 */
export const evalStage = (
  rendersId: string,
  evalSources: ReadonlyArray<Input>,
  evalFiles: ReadonlyArray<string>,
): Stage<CastReader> => {
  const id = rendersId.replace(/^renders:/, 'eval:');
  return {
    id,
    view: id.slice('eval:'.length).split('@')[0],
    inputs: [
      stageInput('train'),
      stageInput(rendersId),
      ...evalSources,
      ...evalFiles.map(fileInput),
    ],
    version: VERSION.eval,
    run: (ctx) =>
      Effect.gen(function* () {
        const reader = yield* CastReader;
        const scored = yield* reader
          .evaluate(yield* ctx.outputPath('train'), yield* ctx.outputPath(rendersId))
          .pipe(Effect.mapError(readerFailed(id)));
        return encoder.encode(scored);
      }),
  };
};

/** The puppet a reader's drawing (`<member>/<entry>`) is posed with: its entry's sheet's, its fitted entry's for a fitted pose. */
const puppetsOf = (memberDir: string, coverage: Coverage) => (drawing: string) =>
  Effect.gen(function* () {
    const id = drawing.slice(coverage.member.length + 1);
    const entry = yield* Effect.fromOption(
      Option.fromUndefinedOr(coverage.entries.find((e) => e.id === id)),
    ).pipe(Effect.mapError(() => `no coverage entry ${id}`));
    const spec = yield* puppetSpecIn(memberDir, entry);
    if (!isPuppetSpec(spec)) return yield* Effect.fail('its puppet spec has no parts');
    return yield* puppetFrom(spec);
  }).pipe(Effect.mapError((e) => ChainFailed.make({ reason: `puppet ${drawing}: ${String(e)}` })));

/**
 * The folder a clip's read is kept in: `<cache>/reads/<key>`, keyed by the
 * checkpoint's and the clip's hashes, the map, the mapping's version and the
 * hashes of the reader's read files (`CastReader.sources.read`, in its sorted
 * order), so a read edit misses it and a train-only edit does not.
 */
export const readsDirOf = Effect.fn('cast.chain.readsDir')(function* (o: {
  readonly ckpt: string;
  readonly clip: string;
  readonly map: ClipMap;
  readonly cache: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const reader = yield* CastReader;
  const hashOf = (file: string) => Effect.map(fs.readFile(file), sha256Hex);
  const key = sha256Hex(
    yield* Schema.encodeEffect(ConfigJson)({
      ckpt: yield* hashOf(o.ckpt),
      clip: yield* hashOf(o.clip),
      map: o.map,
      mapping: MAPPING,
      sources: yield* Effect.forEach(reader.sources.read, hashOf),
    }),
  );
  return path.join(o.cache, 'reads', key);
});

/**
 * `clip` (an mp4) laid on the canvas at `map` (`clip-eval.ts`), read by the
 * checkpoint at `ckpt` and chained (`chain.ts`) with the member's puppets;
 * with the figure numbers of its canvases. The canvases, their figure
 * numbers and the read are kept in `readsDirOf`'s folder (`canvas/`,
 * `figure.json`, `read.json`).
 */
export const chainClip = Effect.fn('cast.chain.clip')(function* (o: {
  readonly ckpt: string;
  readonly clip: string;
  readonly map: ClipMap;
  readonly memberDir: string;
  readonly coverage: Coverage;
  readonly bands: ReadonlyArray<Band>;
  readonly cache: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const reader = yield* CastReader;
  const dir = yield* readsDirOf(o);
  const readFile = path.join(dir, 'read.json');
  const figureFile = path.join(dir, 'figure.json');
  if (!(yield* fs.exists(readFile))) {
    const partial = `${dir}.partial`;
    yield* fs.remove(partial, { recursive: true, force: true });
    const canvas = path.join(partial, 'canvas');
    const figure = yield* writeCanvases(clipFrames(o.clip), o.map, canvas);
    yield* fs.writeFileString(
      path.join(partial, 'figure.json'),
      yield* Schema.encodeEffect(ClipFigureJson)(figure),
    );
    const text = yield* reader.read(o.ckpt, { pngs: canvas });
    yield* fs.writeFileString(path.join(partial, 'read.json'), text);
    yield* fs.remove(dir, { recursive: true, force: true });
    yield* fs.rename(partial, dir);
  }
  const read = yield* Schema.decodeEffect(ClipReadJson)(yield* fs.readFileString(readFile));
  const figure = yield* Schema.decodeEffect(ClipFigureJson)(yield* fs.readFileString(figureFile));
  const chained = yield* chainOf({
    read,
    canvas: path.join(dir, 'canvas'),
    member: o.coverage.member,
    puppetOf: puppetsOf(o.memberDir, o.coverage),
    cache: o.cache,
    bands: o.bands,
  });
  return { ...chained, figure };
});

/**
 * Each of the member's clips chained by the trained reader
 * (`eval:clip:<clip>@<member>`), on this machine; its output is the clip's
 * reader-lock entry (`clips.ts` `clipEntryOf`), pass or fail. It reads the
 * reader, the clip its clip-make stage adopted (`clip:<clip>@<member>`), the
 * provenance beside it (whose map lays it on the canvas), the training set
 * (whose shards stand for the cuts of the drawings it poses), the chain's
 * source files and the reader's read files (`readFiles`,
 * `CastReader.sources.read`), with the chain's settings and the clip's bands
 * and expected drawings as its config.
 */
export const clipStages = (
  m: MemberStages,
  cache: string,
  chainSources: ReadonlyArray<Input>,
  readFiles: ReadonlyArray<string>,
): ReadonlyArray<
  Stage<StageServices | CastReader | Media | ChildProcessSpawner.ChildProcessSpawner>
> =>
  (m.coverage.clips ?? []).map((clip) => {
    const id = `eval:clip:${clip.id}@${m.member}`;
    const made = `clip:${clip.id}@${m.member}`;
    const provenance = `${m.memberDir}/${clip.file.replace(/\.mp4$/, '')}.json`;
    return {
      id,
      view: clip.id,
      inputs: [
        stageInput('train'),
        stageInput(made),
        fileInput(provenance),
        ...chainSources,
        ...readFiles.map(fileInput),
        // the set's shards stand for the cuts of the drawings the reader was trained on
        stageInput('trainset'),
      ],
      version: VERSION.chain,
      config: Schema.encodeSync(ConfigJson)({
        chain: CHAIN,
        bands: clip.bands,
        expect: clip.expect,
      }),
      run: (ctx) =>
        Effect.gen(function* () {
          const ckpt = yield* ctx.outputPath('train');
          const mp4 = yield* ctx.outputPath(made);
          const sha256 = sha256Hex(yield* ctx.output(made));
          const recorded = new TextDecoder().decode(yield* ctx.file(provenance));
          return yield* Effect.gen(function* () {
            const { map } = yield* provenanceIn(recorded);
            const chained = yield* chainClip({
              ckpt,
              clip: mp4,
              map,
              memberDir: m.memberDir,
              coverage: m.coverage,
              bands: clip.bands,
              cache,
            });
            const entry = clipEntryOf({
              member: m.member,
              clip: clip.id,
              sha256,
              bands: declaredBands(m.member, clip),
              chain: chained,
              figure: chained.figure,
            });
            return encoder.encode(yield* Schema.encodeEffect(ClipLockJson)(entry));
          }).pipe(Effect.mapError((e) => StageFailed.make({ reason: `${id}: ${e.message}` })));
        }),
    };
  });

const FitJson = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({
      view: Schema.String,
      rows: Schema.Array(Schema.Struct({ name: Schema.String, pass: Schema.Boolean })),
    }),
  ),
);
