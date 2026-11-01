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
//
// A stage id reads `<stage>:<entry>@<member>` (`cut:turnaround-front@lead-feast`).
// `askStage` is the build's last stage: every entry missing `drawn` or
// `kept` across the members built, waiting on the owner.

import * as Command from 'effect/cli/Command';
import { Effect, FileSystem, Option, Path, Schema, type Scope } from 'effect';
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

/** Bumped when a stage's code makes other bytes from the same inputs. */
const VERSION = { drawing: '1', parts: '1', cut: '1', fit: '1', ask: '1' } as const;

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

/** What the stages run on: the files, `concept parts` and the fit render. */
export type StageServices =
  | FileSystem.FileSystem
  | Path.Path
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
      run: () =>
        Effect.gen(function* () {
          const loaded = yield* Effect.tryPromise(() =>
            importFilmModule(path.join(m.memberDir, 'cutout', 'puppets.ts')),
          );
          const module = yield* Schema.decodeUnknownEffect(PuppetsModule)(loaded);
          const spec = yield* Effect.fromOption(
            Option.fromNullishOr(module.PUPPETS[sheetOf(entry)]),
          ).pipe(Effect.mapError(() => `cutout/puppets.ts has no puppet ${sheetOf(entry)}`));
          // its PNG paths named from the member's folder, so the spec reads the same in any checkout
          const text = yield* Schema.encodeEffect(SpecJson)(spec);
          return encoder.encode(text.replaceAll(`${m.memberDir}/`, ''));
        }).pipe(
          Effect.mapError((e) => StageFailed.make({ reason: `cut ${at(entry.id)}: ${String(e)}` })),
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
  return stages;
});

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
