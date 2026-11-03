// The source files whose code makes each stage kind's bytes. Each kind names
// the modules its code enters at; its sources are every local file those run
// (`importClosure`), so a change anywhere in the code a stage runs stales the
// stages of its kind with no VERSION bump; VERSION (`stages.ts`) stays for a
// change of meaning outside that code. The train is keyed by the reader's own
// files (`CastReader.sources`, the whole `reader/` folder), and drawing,
// status, trainset and ask stages make their bytes from their inputs alone.
// Entry paths are from this folder.
//
// A stage that runs a browser page is keyed by that page's own closure as
// well (`pageSources`): the fit render draws in the app's render page, the
// one file its CLI is given (the app's `RENDER_PAGE`), whose scripts no import
// of the render reaches. A variable import (a module loaded
// by its path at run time) is declared beside its kind in `STAGE_LOADS`, with
// what it loads; a kind whose closure meets an undeclared one fails, so the
// next one cannot hide.

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
  /** `concept parts`, which the parts stage runs. */
  parts: ['../part-sheet-cli.ts'],
  /** The cut stage's code, `puppetSpecIn` and its encoding, lives with the stages. */
  cut: ['stages.ts'],
  /** `renderCast`'s fit render; the page it draws in is the build's (`pageSources`). */
  fit: ['../cast-render.ts'],
  /** The shard's sampler and the puppet it loads (`puppetFrom`). */
  renders: ['renders.ts', '../../puppet/load.ts'],
  eval: ['reader.ts'],
  /** The chain and its fits, and the clip's decode onto the canvas. */
  chain: ['chain.ts', 'chain-fit.ts', 'clip-eval.ts'],
} as const;

type SourcedStage = keyof typeof STAGE_ENTRIES;

/**
 * The files (from this folder) whose variable imports each kind's code meets,
 * and what the stage loads through them. Each stage adds what it loads to its
 * inputs: parts its member's `cutout/cut.ts`, cut his `cutout/*.ts` and the
 * library's puppets, fit the film's `rigs/cast.ts` and its closure
 * (`filmCastSources`).
 */
const STAGE_LOADS = {
  /** `importFilmModule`: the member's `cutout/cut.ts`. */
  parts: ['../film-repo.ts'],
  /** `importFilmModule`: the member's `cutout/puppets.ts` (`specSources`). */
  cut: ['../film-repo.ts'],
  /** `importFilmModule`: the film's `rigs/cast.ts` (`filmCastSources`). */
  fit: ['../film-repo.ts'],
  renders: [],
  eval: [],
  chain: [],
} satisfies { readonly [K in SourcedStage]: ReadonlyArray<string> };

/** Every stage kind's source files as its inputs. */
type StageSources = { readonly [K in SourcedStage]: ReadonlyArray<Input> };

const here = (s: string) => new URL(s, import.meta.url).pathname;

/** A stage kind's entry modules, as absolute paths. */
const stageEntryFiles = (kind: SourcedStage) => STAGE_ENTRIES[kind].map(here);

/** A stage kind's source files, as absolute paths, sorted; fails on an undeclared variable import. */
const sourceFiles = (
  kind: SourcedStage,
): Effect.Effect<
  ReadonlyArray<string>,
  PlatformError | UndeclaredImport | ImportUnresolved | ImportsUnparsed,
  FileSystem.FileSystem | Path.Path
> => declaredClosure(stageEntryFiles(kind), STAGE_LOADS[kind].map(here));

/** The film's `rigs/cast.ts` and every file it runs, which the fit render loads by its path. */
export const filmCastSources = (filmDir: string) =>
  Effect.map(declaredClosure([`${filmDir}/rigs/cast.ts`], []), (files) => files.map(fileInput));

/**
 * A member's `cutout/cut.ts` and every file it runs (its view rules, its
 * clean rules, its data), which `concept parts` loads by its path, so a
 * change to a rule it imports stales his parts stages. Read from the file's
 * real path, as Bun runs a linked one. A member with no cut table yet has the
 * path alone, which the parts stage reads as a missing file.
 */
export const cutTableSources = (memberDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const cut = `${memberDir}/cutout/cut.ts`;
    if (!(yield* fs.exists(cut))) return [fileInput(cut)];
    const files = yield* declaredClosure([yield* fs.realPath(cut)], STAGE_LOADS.parts.map(here));
    return [...new Set([cut, ...files])].map(fileInput);
  });

/** A browser page's HTML and every file its scripts and stylesheets run (`pageClosure`). */
export const pageSources = (page: string) =>
  Effect.map(pageClosure(page), (files) => files.map(fileInput));

const inputsOf = (kind: SourcedStage) =>
  Effect.map(sourceFiles(kind), (files) => files.map(fileInput));

/** Every stage kind's source files as its inputs. */
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
