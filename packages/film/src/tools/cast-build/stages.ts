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
// complete drawing's shard after this build's stages; `trainStage`, the one reader trained on that set (spending
// Modal), keyed by the set, its shards and the reader's source files;
// `evalStage` per shard, that drawing's held samples read and scored by the
// reader (`reader.ts`, on this machine). The owner's ask and draws are
// `owner-ask.ts`'s.

import * as Command from 'effect/cli/Command';
import { Effect, FileSystem, Option, Path, Predicate, Schema, type Scope } from 'effect';
import type { ChildProcessSpawner } from 'effect/process';
import type { PuppetSpec } from '../../canvas/puppet.ts';
import type { PuppetImages } from '../../puppet/images.ts';
import { puppetFrom } from '../../puppet/load.ts';
import { renderCast } from '../cast-render.ts';
import { sha256Hex } from '../digest.ts';
import { type FilmName, importFilmModule } from '../film-repo.ts';
import { parts } from '../part-sheet-cli.ts';
import { type Band, CHAIN, ChainFailed, ClipReadJson, chainOf } from './chain.ts';
import { type Coverage, type EntryFacts, coverageOf } from './coverage.ts';
import { barsOfRecord, sheetOf } from './coverage-facts.ts';
import {
  type Input,
  type Stage,
  StageFailed,
  WaitingOwner,
  fileInput,
  optionalInput,
  stageInput,
} from './graph.ts';
import { CastReader, type ReaderError } from './reader.ts';
import { SAMPLES, shardOf, trainsetOf } from './renders.ts';
import { stageSources } from './sources.ts';

/** Bumped when a stage's code makes other bytes from the same inputs. */
const VERSION = {
  drawing: '1',
  parts: '2',
  cut: '2',
  fit: '1',
  renders: '1',
  status: '1',
  trainset: '2',
  train: '2',
  eval: '1',
  chain: '1',
} as const;

/**
 * The reader's train: steps, batch, learning rate, seed, GPU, precision, its
 * backbone and the input it reads (width and height in px); a fixed step
 * count, no wall-clock stop. The backbone and input are `reader/model.py`'s
 * (`BACKBONE`, `IN_W, IN_H`), held equal by `reader.test.ts`.
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
export const encodeParts = (parts: typeof PartsJson.Type) =>
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

/** One member's stages, in the order they build. */
export const memberStages = Effect.fn('cast.build.memberStages')(function* (m: MemberStages) {
  const path = yield* Path.Path;
  const sources = yield* specSources(m.memberDir, m.libraryPuppets);
  const src = yield* stageSources;
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
  for (const entry of m.coverage.entries) {
    if (entry.cut !== 'puppet' || Option.isSome(Option.fromUndefinedOr(entry.fitted))) continue;
    const sheet = path.join(m.memberDir, 'cutout', 'sheets', sheetOf(entry));
    // every file of the sheet folder: its record and part PNGs (which `--check` holds to its
    // answers), and its okra ledger and answers
    const sheetFiles = yield* filesUnder(sheet);
    stages.push({
      id: `parts:${at(entry.id)}`,
      view: entry.id,
      inputs: [
        stageInput(`drawing:${at(entry.id)}`),
        fileInput(path.join(m.memberDir, 'cutout', 'cut.ts')),
        ...sheetFiles.map((f) => fileInput(path.join(sheet, f))),
        ...src.parts,
      ],
      version: VERSION.parts,
      run: (ctx) =>
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
    // training set takes it only when its entry is complete (`trainsetStage`)
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
  Schema.Struct({ complete: Schema.Boolean, missing: Schema.Array(Schema.String) }),
);

/**
 * An entry's coverage verdict, `coverageOf` over facts read off this
 * build's outputs: drawn and kept, its drawing stage made (it fails
 * otherwise); bars, its parts output's record; cut, its cut made; fit, its
 * fit rows pass. Its inputs are those stages, so a record whose bars change
 * changes the verdict and every key that reads it.
 */
export const statusStage = (entry: string, member: string): Stage<never> => {
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
        const text = yield* Schema.encodeEffect(StatusJson)({ complete: report.complete, missing });
        return encoder.encode(text);
      }).pipe(Effect.mapError((e) => StageFailed.make({ reason: `${ids.status}: ${String(e)}` }))),
  };
};

/** Whether a status stage's output says its entry is complete. */
const completeIn = (bytes: Uint8Array) =>
  Schema.decodeEffect(StatusJson)(new TextDecoder().decode(bytes)).pipe(
    Effect.map((s) => s.complete),
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
export const candidateOf = (entry: string, member: string): Candidate => {
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
 * says complete, by its drawing, sorted. Its renders and status are
 * optional inputs, so the set is keyed by every eligibility fact through
 * those outputs; a drawing that waits (its sheet not yet cut) leaves the set
 * without holding it, and one made complete in this build joins it.
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
        if (yield* completeIn(yield* ctx.output(c.status)))
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
 * The one reader trained on the training set, on Modal; it spends, so it
 * waits unless `--spend modal`. It reads the set, every shard in it and
 * the reader's source files (`sources`, every file a train ships), so a
 * change to any of them is a new reader. Its output is the checkpoint; on
 * Modal it is `/readers/<the hash of those inputs and the config>.pt`.
 */
export const trainStage = (
  candidates: ReadonlyArray<Candidate>,
  sources: ReadonlyArray<string>,
): Stage<CastReader> => ({
  id: 'train',
  inputs: [
    // the set names each shard by its hash, so its shards are in its key
    stageInput('trainset'),
    ...sources.map(fileInput),
  ],
  version: VERSION.train,
  config: TRAIN_CONFIG,
  run: (ctx) =>
    ctx.spend(
      'modal',
      Effect.gen(function* () {
        const reader = yield* CastReader;
        const set = yield* ctx.output('trainset');
        const trainset = sha256Hex(set);
        const inSet = new Set(drawingsIn(set));
        const lines = [`trainset=${trainset}`, `config=${TRAIN_CONFIG}`];
        for (const file of sources)
          lines.push(`${file.split('/').at(-1)}=${sha256Hex(yield* ctx.file(file))}`);
        const shards = yield* Effect.forEach(
          candidates.filter((c) => inSet.has(c.drawing)).map((c) => c.renders),
          ctx.outputPath,
        );
        const made = yield* reader
          .train({
            trainset,
            key: sha256Hex(encoder.encode(lines.join('\n'))),
            shards,
            config: TRAIN,
          })
          .pipe(Effect.mapError(readerFailed('train')));
        yield* Effect.log(`cast.build.train result=${made.result}`);
        return made.checkpoint;
      }),
      TRAIN_USD,
    ),
});

/** One drawing's held samples read by the trained reader and scored, by its renders stage's id. */
export const evalStage = (
  rendersId: string,
  evalSources: ReadonlyArray<Input>,
): Stage<CastReader> => {
  const id = rendersId.replace(/^renders:/, 'eval:');
  return {
    id,
    view: id.slice('eval:'.length).split('@')[0],
    inputs: [stageInput('train'), stageInput(rendersId), ...evalSources],
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
export const puppetsOf = (memberDir: string, coverage: Coverage) => (drawing: string) =>
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
 * `clip` read by the checkpoint at `ckpt` and chained (`chain.ts`) with
 * the member's puppets. The read and its mapped frames are kept in
 * `<cache>/reads/<key>/`, keyed by the checkpoint's, the clip's and the
 * reader's source files' hashes.
 */
export const chainClip = Effect.fn('cast.chain.clip')(function* (o: {
  readonly ckpt: string;
  readonly clip: string;
  readonly memberDir: string;
  readonly coverage: Coverage;
  readonly bands: ReadonlyArray<Band>;
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
      sources: yield* Effect.forEach(reader.sources, hashOf),
    }),
  );
  const dir = path.join(o.cache, 'reads', key);
  const readFile = path.join(dir, 'read.json');
  if (!(yield* fs.exists(readFile))) {
    const partial = `${dir}.partial`;
    yield* fs.remove(partial, { recursive: true, force: true });
    const text = yield* reader.read(o.ckpt, { clip: o.clip }, path.join(partial, 'canvas'));
    yield* fs.writeFileString(path.join(partial, 'read.json'), text);
    yield* fs.remove(dir, { recursive: true, force: true });
    yield* fs.rename(partial, dir);
  }
  const read = yield* Schema.decodeEffect(ClipReadJson)(yield* fs.readFileString(readFile));
  return yield* chainOf({
    read,
    canvas: path.join(dir, 'canvas'),
    member: o.coverage.member,
    puppetOf: puppetsOf(o.memberDir, o.coverage),
    cache: o.cache,
    bands: o.bands,
  });
});

/**
 * Each of the member's clips chained by the trained reader
 * (`eval:clip:<clip>@<member>`), on this machine. It reads the reader, the
 * clip, the training set (whose shards stand for the cuts of the drawings
 * it poses) and the chain's source files, with the
 * chain's settings and the clip's bands as its config.
 */
export const clipStages = (
  m: MemberStages,
  cache: string,
  chainSources: ReadonlyArray<Input>,
): ReadonlyArray<Stage<StageServices | CastReader | ChildProcessSpawner.ChildProcessSpawner>> =>
  (m.coverage.clips ?? []).map((clip) => {
    const id = `eval:clip:${clip.id}@${m.member}`;
    const file = `${m.memberDir}/${clip.file}`;
    return {
      id,
      view: clip.id,
      inputs: [
        stageInput('train'),
        fileInput(file),
        ...chainSources,
        // the set's shards stand for the cuts of the drawings the reader was trained on
        stageInput('trainset'),
      ],
      version: VERSION.chain,
      config: Schema.encodeSync(ConfigJson)({ chain: CHAIN, bands: clip.bands }),
      run: (ctx) =>
        Effect.gen(function* () {
          const ckpt = yield* ctx.outputPath('train');
          return yield* Effect.gen(function* () {
            const made = yield* chainClip({
              ckpt,
              clip: file,
              memberDir: m.memberDir,
              coverage: m.coverage,
              bands: clip.bands,
              cache,
            });
            return encoder.encode(yield* Schema.encodeEffect(ConfigJson)(made));
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
