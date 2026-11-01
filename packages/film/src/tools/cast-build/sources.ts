// The source files whose code makes each stage kind's bytes. Each kind names
// the modules its code enters at; its sources are every local file those run
// (`importClosure`), so a change anywhere in the code a stage runs stales the
// stages of its kind with no VERSION bump; VERSION (`stages.ts`) stays for a
// change of meaning outside that code. The train is keyed by the reader's own
// files (`CastReader.sources`, the whole `reader/` folder), and drawing,
// status, trainset and ask stages make their bytes from their inputs alone.
// Entry paths are from this folder.
//
// A stage that runs a browser page names the page's own entry: the fit
// render draws in the app's page, whose cut-out drawing is `player/cast.ts`,
// which no import of the render reaches. A variable import (a module loaded
// by its path at run time) is declared beside its kind in `STAGE_LOADS`, with
// what it loads; a kind whose closure meets an undeclared one fails, so the
// next one cannot hide.

import { Effect, type FileSystem, type Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { fileInput, type Input } from './graph.ts';
import { declaredClosure, type UndeclaredImport } from './imports.ts';

export const STAGE_ENTRIES = {
  /** `concept parts`, which the parts stage runs. */
  parts: ['../part-sheet-cli.ts'],
  /** The cut stage's code, `puppetSpecIn` and its encoding, lives with the stages. */
  cut: ['stages.ts'],
  /** `renderCast`'s fit render, and the page it draws in (`player/cast.ts`, the cut-out canvas). */
  fit: ['../cast-render.ts', '../../player/cast.ts'],
  /** The shard's sampler and the puppet it loads (`puppetFrom`). */
  renders: ['renders.ts', '../../puppet/load.ts'],
  eval: ['reader.ts'],
  chain: ['chain.ts', 'chain-fit.ts'],
} as const;

export type SourcedStage = keyof typeof STAGE_ENTRIES;

/**
 * The files (from this folder) whose variable imports each kind's code meets,
 * and what the stage loads through them. Each stage adds what it loads to its
 * inputs: parts its member's `cutout/cut.ts`, cut his `cutout/*.ts` and the
 * library's puppets, fit the film's `rigs/cast.ts` and its closure
 * (`filmCastSources`).
 */
export const STAGE_LOADS = {
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
export type StageSources = { readonly [K in SourcedStage]: ReadonlyArray<Input> };

const here = (s: string) => new URL(s, import.meta.url).pathname;

/** A stage kind's source files, as absolute paths, sorted; fails on an undeclared variable import. */
export const sourceFiles = (
  kind: SourcedStage,
): Effect.Effect<
  ReadonlyArray<string>,
  PlatformError | UndeclaredImport,
  FileSystem.FileSystem | Path.Path
> => declaredClosure(STAGE_ENTRIES[kind].map(here), STAGE_LOADS[kind].map(here));

/** The film's `rigs/cast.ts` and every file it runs, which the fit render loads by its path. */
export const filmCastSources = (filmDir: string) =>
  Effect.map(declaredClosure([`${filmDir}/rigs/cast.ts`], []), (files) => files.map(fileInput));

const inputsOf = (kind: SourcedStage) =>
  Effect.map(sourceFiles(kind), (files) => files.map(fileInput));

/** Every stage kind's source files as its inputs. */
export const stageSources: Effect.Effect<
  StageSources,
  PlatformError | UndeclaredImport,
  FileSystem.FileSystem | Path.Path
> = Effect.all({
  parts: inputsOf('parts'),
  cut: inputsOf('cut'),
  fit: inputsOf('fit'),
  renders: inputsOf('renders'),
  eval: inputsOf('eval'),
  chain: inputsOf('chain'),
});
