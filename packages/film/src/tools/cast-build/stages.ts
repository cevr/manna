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
//                 its drawing.
//   renders:<id>  a puppet entry cut from its own sheet: its synthetic
//                 training renders, one shard (`renders.ts`); it reads its
//                 cut. An entry fitted with another view's cut has none.
//
// A stage id reads `<stage>:<entry>@<member>` (`cut:turnaround-front@lead-feast`).
// After every member's stages: `trainsetStage`, the sorted hashes of every
// shard built; `trainStage`, the one reader trained on that set (spending
// Modal), keyed by the set, its shards and the reader's source files;
// `evalStage` per shard, that drawing's held samples read and scored by the
// reader (`reader.ts`, on this machine); `askStage`, every entry missing
// `drawn` or `kept` across the members built, waiting on the owner.

import * as Command from 'effect/cli/Command';
import { Effect, FileSystem, Option, Path, Predicate, Schema, type Scope } from 'effect';
import type { PuppetSpec } from '../../canvas/puppet.ts';
import type { PuppetImages } from '../../puppet/images.ts';
import { puppetFrom } from '../../puppet/load.ts';
import { renderCast } from '../cast-render.ts';
import { sha256Hex } from '../digest.ts';
import { type FilmName, importFilmModule } from '../film-repo.ts';
import { parts } from '../part-sheet-cli.ts';
import type { Coverage, EntryFacts } from './coverage.ts';
import { sheetOf } from './coverage-facts.ts';
import {
  type Input,
  type Stage,
  StageFailed,
  WaitingOwner,
  fileInput,
  stageInput,
} from './graph.ts';
import { CastReader, type ReaderError } from './reader.ts';
import { SAMPLES, shardOf, trainsetOf } from './renders.ts';

/** Bumped when a stage's code makes other bytes from the same inputs. */
const VERSION = {
  drawing: '1',
  parts: '1',
  cut: '2',
  fit: '1',
  renders: '1',
  trainset: '1',
  train: '2',
  eval: '1',
  ask: '1',
} as const;

/** The reader's train: steps, batch, learning rate, seed, GPU and precision; a fixed step count, no wall-clock stop. */
const TRAIN = { steps: 4800, batch: 32, lr: 1e-3, seed: 0, gpu: 'L4', precision: 'bf16' } as const;
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

/** A file set as one output: each file's path from `dir` and its bytes' hash, a line each, sorted. */
const listing = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const lines: Array<string> = [];
    for (const name of yield* filesUnder(dir))
      lines.push(`${name}=${sha256Hex(yield* fs.readFile(path.join(dir, name)))}`);
    return encoder.encode(lines.join('\n'));
  }).pipe(Effect.mapError((e) => StageFailed.make({ reason: `listing ${dir}: ${String(e)}` })));

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
  /** An entry named in a stage id: `<entry>@<member>`, so `cut:<entry>` leads it and two members never share one. */
  const at = (id: string) => `${id}@${m.member}`;
  const factsOf = (id: string) => Option.fromNullishOr(m.facts[id]);
  const stages: Array<Stage<StageServices>> = [];
  /** The entries whose part sheet has a record: cut once, so a puppet to pose. */
  const recorded = new Set<string>();
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
    if (sheetFiles.includes('record.json')) recorded.add(entry.id);
    stages.push({
      id: `parts:${at(entry.id)}`,
      view: entry.id,
      inputs: [
        stageInput(`drawing:${at(entry.id)}`),
        fileInput(path.join(m.memberDir, 'cutout', 'cut.ts')),
        ...sheetFiles.map((f) => fileInput(path.join(sheet, f))),
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
          return yield* listing(sheet);
        }),
    });
    stages.push({
      id: `cut:${at(entry.id)}`,
      view: entry.id,
      inputs: [stageInput(`parts:${at(entry.id)}`), ...sources.map((s): Input => fileInput(s))],
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
  for (const entry of m.coverage.entries) {
    if (entry.cut !== 'puppet') continue;
    const cut = `cut:${at(entry.fitted ?? entry.id)}`;
    stages.push({
      id: `fit:${at(entry.id)}`,
      view: entry.id,
      inputs: [stageInput(cut), stageInput(`drawing:${at(entry.id)}`)],
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
    // only a drawing cut from its own sheet: one not yet cut has no puppet to pose, so the
    // training set does not wait on it
    if (entry.cut !== 'puppet' || Option.isSome(Option.fromUndefinedOr(entry.fitted))) continue;
    if (!recorded.has(entry.id)) continue;
    stages.push({
      id: `renders:${at(entry.id)}`,
      view: entry.id,
      inputs: [stageInput(`cut:${at(entry.id)}`)],
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
  }
  return stages;
});

/** The renders stages among `stages`, by the drawing they render, `<member>/<entry>`. */
export const rendersOf = (stages: ReadonlyArray<Stage<unknown>>): Record<string, string> =>
  Object.fromEntries(
    stages.flatMap((s) => {
      const match = Option.fromNullishOr(/^renders:(.+)@(.+)$/.exec(s.id));
      return Option.match(match, {
        onNone: () => [],
        onSome: ([, entry, member]) => [[`${member}/${entry}`, s.id] as const],
      });
    }),
  );

/** The training set: every shard's hash, by its drawing, sorted. */
export const trainsetStage = (renders: Readonly<Record<string, string>>): Stage<never> => ({
  id: 'trainset',
  inputs: Object.values(renders).map(stageInput),
  version: VERSION.trainset,
  run: (ctx) =>
    Effect.forEach(Object.entries(renders), ([drawing, id]) =>
      Effect.map(ctx.output(id), (shard) => [drawing, sha256Hex(shard)] as const),
    ).pipe(Effect.map((shards) => trainsetOf(Object.fromEntries(shards)))),
});

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
  renders: Readonly<Record<string, string>>,
  sources: ReadonlyArray<string>,
): Stage<CastReader> => ({
  id: 'train',
  inputs: [
    stageInput('trainset'),
    ...Object.values(renders).map(stageInput),
    ...sources.map(fileInput),
  ],
  version: VERSION.train,
  config: TRAIN_CONFIG,
  run: (ctx) =>
    ctx.spend(
      'modal',
      Effect.gen(function* () {
        const reader = yield* CastReader;
        const trainset = sha256Hex(yield* ctx.output('trainset'));
        const lines = [`trainset=${trainset}`, `config=${TRAIN_CONFIG}`];
        for (const file of sources)
          lines.push(`${file.split('/').at(-1)}=${sha256Hex(yield* ctx.file(file))}`);
        const shards = yield* Effect.forEach(Object.values(renders), ctx.outputPath);
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
export const evalStage = (rendersId: string): Stage<CastReader> => {
  const id = rendersId.replace(/^renders:/, 'eval:');
  return {
    id,
    view: id.slice('eval:'.length).split('@')[0],
    inputs: [stageInput('train'), stageInput(rendersId)],
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

const FitJson = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({
      view: Schema.String,
      rows: Schema.Array(Schema.Struct({ name: Schema.String, pass: Schema.Boolean })),
    }),
  ),
);

/** The entries across the members built that the owner must draw or keep, by `<member>/<id>`. */
export const ownerNeeds = (members: ReadonlyArray<MemberStages>): ReadonlyArray<string> =>
  members.flatMap((m) =>
    m.coverage.entries.flatMap((e) => {
      const facts = Option.fromNullishOr(m.facts[e.id]);
      const lacks = (['drawn', 'kept'] as const).filter(
        (need) => !Option.exists(facts, (f) => f[need]),
      );
      if (lacks.length === 0) return [];
      return [`${m.member}/${e.id} (${lacks.join(', ')})`];
    }),
  );

/** The build's ask: every entry the owner must draw or keep, in one wait; it draws nothing. */
export const askStage = (needs: ReadonlyArray<string>): Stage<never> => ({
  id: 'ask',
  inputs: [],
  version: VERSION.ask,
  config: needs.join('\n'),
  run: () => {
    if (needs.length === 0) return Effect.succeed(encoder.encode('none'));
    return Effect.fail(
      WaitingOwner.make({ reason: `the owner draws or keeps: ${needs.join('; ')}` }),
    );
  },
});
