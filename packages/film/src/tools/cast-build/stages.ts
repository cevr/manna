import * as Command from 'effect/cli/Command';
import {
  DateTime,
  Effect,
  Equal,
  FileSystem,
  Option,
  Path,
  Predicate,
  Result,
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
import { decodePng } from '../png.ts';
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
  puppetSources,
  filmCastSources,
  pageSources,
  stageSources,
} from './sources.ts';

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
const TRAIN_USD = 0.92;

const encoder = new TextEncoder();

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
const RENDERS_CONFIG = Schema.encodeSync(ConfigJson)(SAMPLES);
const TRAIN_CONFIG = Schema.encodeSync(ConfigJson)(TRAIN);
const PuppetsModule = Schema.Struct({ PUPPETS: Schema.Record(Schema.String, Schema.Unknown) });

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

const runParts = (film: FilmName, member: string, view: string, flags: ReadonlyArray<string>) =>
  Command.runWith(parts, { version: 'build' })([film, member, '--view', view, ...flags]);

const runCutter = (script: string, sheets: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const code = yield* spawner
      .exitCode(ChildProcess.make('bun', [script, sheets], { forceKillAfter: '5 seconds' }))
      .pipe(Effect.mapError((e) => StageFailed.make({ reason: `${script}: ${e.message}` })));
    if (code !== 0) return yield* StageFailed.make({ reason: `${script} exited ${code}` });
  });

const contentOf = (name: string, bytes: Uint8Array) => {
  const asBytes = `bytes:${sha256Hex(bytes)}`;
  if (!name.endsWith('.png')) return asBytes;
  return Result.match(decodePng(bytes), {
    onSuccess: (r) => `${r.width}x${r.height}:${sha256Hex(r.rgba)}`,
    onFailure: () => asBytes,
  });
};

const checkedCutters = (memberDir: string, scripts: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sheets = path.join(memberDir, 'cutout', 'sheets');
    const scratch = yield* fs.makeTempDirectoryScoped();
    yield* Effect.forEach(scripts, (s) => runCutter(s, scratch), { discard: true });
    const made = yield* Effect.forEach(yield* filesUnder(scratch), (name) =>
      Effect.map(fs.readFile(path.join(scratch, name)), (bytes) => ({ name, bytes })),
    );
    const madeNames = new Set(made.map((f) => f.name));
    const unmade = (yield* filesUnder(sheets)).filter(
      (name) => !madeNames.has(name) && !name.split(path.sep).includes('okra'),
    );
    if (unmade.length > 0)
      return yield* StageFailed.make({
        reason: `his cutters no longer make ${unmade.join(', ')}; run them by hand and commit to drop it`,
      });
    const committed = yield* Effect.forEach(made, (file) =>
      fs.readFile(path.join(sheets, file.name)).pipe(
        Effect.map((held) => ({ ...file, held: Option.some(held) })),
        Effect.orElseSucceed(() => ({ ...file, held: Option.none<Uint8Array>() })),
      ),
    );
    const changed = committed.filter(({ name, bytes, held }) =>
      Option.exists(held, (h) => contentOf(name, h) !== contentOf(name, bytes)),
    );
    if (changed.length > 0)
      return yield* StageFailed.make({
        reason: `his cutters change ${changed.map((c) => c.name).join(', ')} from the committed files; run them by hand and commit to keep a change`,
      });
    for (const { name, bytes } of committed.filter((c) => Option.isNone(c.held))) {
      yield* fs.makeDirectory(path.dirname(path.join(sheets, name)), { recursive: true });
      yield* fs.writeFile(path.join(sheets, name), bytes);
    }
  }).pipe(
    Effect.scoped,
    Effect.catchTag('PlatformError', (e) =>
      StageFailed.make({ reason: `his cutters' sheets: ${e.message}` }),
    ),
  );

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

const isPuppetSpec = (u: unknown): u is PuppetSpec =>
  Predicate.hasProperty(u, 'key') &&
  Predicate.hasProperty(u, 'size') &&
  Predicate.hasProperty(u, 'skeleton') &&
  Predicate.hasProperty(u, 'parts') &&
  Array.isArray(u.parts);

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
  readonly coverage: Coverage;
  readonly facts: Readonly<Record<string, EntryFacts>>;
}

interface BuildSources {
  readonly stage: Effect.Success<typeof stageSources>;
  readonly filmCast: ReadonlyArray<Input>;
  readonly page: ReadonlyArray<Input>;
}

export const buildSources = Effect.fn('cast.build.sources')(function* (
  film: FilmName,
  page: string,
) {
  const stage = yield* stageSources;
  const filmCast = yield* filmCastSources((yield* FilmFolder).paths(film).dir);
  return { stage, filmCast, page: yield* pageSources(page) } satisfies BuildSources;
});

export const memberStages = Effect.fn('cast.build.memberStages')(function* (
  m: MemberStages,
  built: BuildSources,
) {
  const path = yield* Path.Path;
  const puppets = yield* puppetSources(m.memberDir);
  const src = built.stage;
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
  const cutters = Option.map(Option.fromUndefinedOr(m.coverage.cutters), (scripts) =>
    scripts.map((s) => path.join(m.memberDir, s)),
  );
  const maker = yield* Option.match(cutters, {
    onNone: () => cutTableSources(m.memberDir),
    onSome: cutterSources,
  });
  for (const entry of m.coverage.entries) {
    if (entry.cut !== 'puppet' || Option.isSome(Option.fromUndefinedOr(entry.fitted))) continue;
    const sheet = path.join(m.memberDir, 'cutout', 'sheets', sheetOf(entry));
    const sheetFiles = yield* filesUnder(sheet);
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
        ...src.parts,
        ...sheetFiles.map((f) => fileInput(path.join(sheet, f))),
      ],
      version: VERSION.parts,
      run: (ctx) =>
        Effect.gen(function* () {
          yield* Option.match(cutters, {
            onNone: () => byParts(ctx),
            onSome: (scripts) => checkedCutters(m.memberDir, scripts),
          });
          return yield* partsOutput(sheet);
        }),
    });
    stages.push({
      id: `cut:${at(entry.id)}`,
      view: entry.id,
      inputs: [stageInput(`parts:${at(entry.id)}`), ...puppets, ...src.cut],
      version: VERSION.cut,
      run: (ctx) =>
        Effect.gen(function* () {
          const spec = yield* puppetSpecIn(m.memberDir, entry);
          const text = yield* Schema.encodeEffect(SpecJson)(spec);
          return text.replaceAll(`${m.memberDir}/`, '');
        }).pipe(
          Effect.mapError((e) => StageFailed.make({ reason: `cut ${at(entry.id)}: ${String(e)}` })),
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

const trainableIn = (bytes: Uint8Array) =>
  Schema.decodeEffect(StatusJson)(new TextDecoder().decode(bytes)).pipe(
    Effect.map((s) => s.trainable),
    Effect.orElseSucceed(() => false),
  );

export interface Candidate {
  readonly drawing: string;
  readonly renders: string;
  readonly status: string;
}

const candidateOf = (entry: string, member: string): Candidate => {
  const ids = idsOf(entry, member);
  return { drawing: `${member}/${entry}`, renders: ids.renders, status: ids.status };
};

export const candidatesOf = (m: MemberStages): ReadonlyArray<Candidate> =>
  m.coverage.entries
    .filter((e) => e.cut === 'puppet' && Option.isNone(Option.fromUndefinedOr(e.fitted)))
    .map((e) => candidateOf(e.id, m.member));

export const fitPasses = (bytes: Uint8Array) =>
  Schema.decodeEffect(FitJson)(new TextDecoder().decode(bytes)).pipe(
    Effect.map((views) => views.length > 0 && views.every((v) => v.rows.every((r) => r.pass))),
    Effect.orElseSucceed(() => false),
  );

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

const drawingsIn = (trainset: Uint8Array) =>
  new TextDecoder()
    .decode(trainset)
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => line.slice(0, line.lastIndexOf('=')));

const readerFailed = (id: string) => (e: ReaderError) =>
  StageFailed.make({ reason: `${id}: ${e.message}` });

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

const FitResult = Schema.fromJsonString(
  Schema.Struct({ steps: Schema.Finite, sec_per_step: Schema.Finite, last_loss: Schema.Finite }),
);

export const FitNote = Schema.fromJsonString(
  Schema.Struct({
    trainedOn: Schema.String,
    modalApp: Schema.optionalKey(Schema.String),
    steps: Schema.Finite,
    secPerStep: Schema.Finite,
    finalLoss: Schema.Finite,
  }),
);

export const TrainLines = Schema.Struct({
  trainedOn: Schema.optionalKey(Schema.String),
  modalApp: Schema.optionalKey(Schema.String),
  steps: Schema.optionalKey(Schema.Finite),
  secPerStep: Schema.optionalKey(Schema.Finite),
  trainSec: Schema.optionalKey(Schema.Finite),
  finalLoss: Schema.optionalKey(Schema.Finite),
  stageSec: Schema.Finite,
});

export const BuildSpend = Schema.Struct({ buildCountedUsd: Schema.Finite });

export const AdoptedNote = Schema.fromJsonString(
  Schema.Struct({
    adopted: Schema.Struct({ train: TrainLines, spend: Schema.optionalKey(BuildSpend) }),
  }),
);

export const Spread = Schema.Struct({ median: Schema.Finite, p90: Schema.Finite });

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

export const HeldLine = Schema.Struct({
  n: Schema.Finite,
  accuracy: Schema.Finite,
  angleDeg: Spread,
  jointPx: Spread,
});

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

export const trainStage = (
  candidates: ReadonlyArray<Candidate>,
  trainFiles: ReadonlyArray<string>,
  lock: string,
  o: { readonly keepReader: boolean } = { keepReader: false },
): Stage<CastReader | FileSystem.FileSystem> => {
  const adopted = new Set<string>();
  const trainOn = trainOnModal(candidates, trainFiles);
  const committedOf = (ctx: StageContext) =>
    Effect.gen(function* () {
      const text = yield* ctx.file(lock).pipe(Effect.option);
      return yield* Effect.option(
        Effect.flatMap(Effect.fromOption(text), (bytes) =>
          Schema.decodeEffect(CommittedLock)(new TextDecoder().decode(bytes)),
        ),
      );
    });
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
    inputs: [stageInput('trainset'), ...trainFiles.map(fileInput)],
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
          Effect.catch((e) =>
            Effect.logWarning(`cast.build.train fit-unread reason="${String(e)}"`),
          ),
        );
        return made.checkpoint;
      }),
      TRAIN_USD,
    );

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
