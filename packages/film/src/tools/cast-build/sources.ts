import { Effect, FileSystem, type Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { fileInput, type Input } from './graph.ts';
import {
  type ImportUnresolved,
  type ImportsUnparsed,
  type UndeclaredImport,
  declaredClosure,
  pageClosure,
} from './imports.ts';

const STAGE_ENTRIES = {
  parts: ['../part-sheet-cli.ts'],
  cut: ['stages.ts'],
  fit: ['../cast-render.ts'],
  renders: ['renders.ts', '../../puppet/load.ts'],
  eval: ['reader.ts'],
  chain: ['chain.ts', 'chain-fit.ts', 'clip-eval.ts'],
} as const;

type SourcedStage = keyof typeof STAGE_ENTRIES;

const STAGE_LOADS = {
  parts: ['../film-repo.ts'],
  cut: ['../film-repo.ts'],
  fit: ['../film-repo.ts'],
  renders: [],
  eval: [],
  chain: [],
} satisfies { readonly [K in SourcedStage]: ReadonlyArray<string> };

const CUTTER_LOADS = ['../film-repo.ts'];

type StageSources = { readonly [K in SourcedStage]: ReadonlyArray<Input> };

const here = (s: string) => new URL(s, import.meta.url).pathname;

const stageEntryFiles = (kind: SourcedStage) => STAGE_ENTRIES[kind].map(here);

const sourceFiles = (
  kind: SourcedStage,
): Effect.Effect<
  ReadonlyArray<string>,
  PlatformError | UndeclaredImport | ImportUnresolved | ImportsUnparsed,
  FileSystem.FileSystem | Path.Path
> => declaredClosure(stageEntryFiles(kind), STAGE_LOADS[kind].map(here));

export const filmCastSources = (filmDir: string) =>
  Effect.map(declaredClosure([`${filmDir}/rigs/cast.ts`], []), (files) => files.map(fileInput));

export const cutTableSources = (memberDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const cut = `${memberDir}/cutout/cut.ts`;
    if (!(yield* fs.exists(cut))) return [fileInput(cut)];
    const files = yield* declaredClosure([yield* fs.realPath(cut)], STAGE_LOADS.parts.map(here));
    return [...new Set([cut, ...files])].map(fileInput);
  });

export const puppetSources = (memberDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const puppets = `${memberDir}/cutout/puppets.ts`;
    if (!(yield* fs.exists(puppets))) return [fileInput(puppets)];
    const files = yield* declaredClosure([yield* fs.realPath(puppets)], STAGE_LOADS.cut.map(here));
    return [...new Set([puppets, ...files])].map(fileInput);
  });

export const cutterSources = (scripts: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const real = yield* Effect.forEach(scripts, (s) => fs.realPath(s));
    const files = yield* declaredClosure(real, CUTTER_LOADS.map(here));
    return [...new Set([...scripts, ...files])].map(fileInput);
  });

export const pageSources = (page: string) =>
  Effect.map(pageClosure(page), (files) => files.map(fileInput));

const inputsOf = (kind: SourcedStage) =>
  Effect.map(sourceFiles(kind), (files) => files.map(fileInput));

export const stageSources: Effect.Effect<
  StageSources,
  PlatformError | UndeclaredImport | ImportUnresolved | ImportsUnparsed,
  FileSystem.FileSystem | Path.Path
> = Effect.all({
  parts: inputsOf('parts'),
  cut: inputsOf('cut'),
  fit: inputsOf('fit'),
  renders: inputsOf('renders'),
  eval: inputsOf('eval'),
  chain: inputsOf('chain'),
});
