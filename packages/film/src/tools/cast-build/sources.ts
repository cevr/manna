// The source files whose code makes each stage kind's bytes. Each kind names
// the modules its code enters at; its sources are every local file those run
// (`importClosure`), so a change anywhere in the code a stage runs stales the
// stages of its kind with no VERSION bump; VERSION (`stages.ts`) stays for a
// change of meaning outside that code. The train is keyed by the reader's own
// files (`CastReader.sources`, the whole `reader/` folder), and drawing,
// status, trainset and ask stages make their bytes from their inputs alone.
// Entry paths are from this folder.

import { Effect, type FileSystem, type Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { fileInput, type Input } from './graph.ts';
import { importClosure } from './imports.ts';

export const STAGE_ENTRIES = {
  /** `concept parts`, which the parts stage runs. */
  parts: ['../part-sheet-cli.ts'],
  /** The cut stage's code, `puppetSpecIn` and its encoding, lives with the stages. */
  cut: ['stages.ts'],
  /** `renderCast`'s fit render. */
  fit: ['../cast-render.ts'],
  /** The shard's sampler and the puppet it loads (`puppetFrom`). */
  renders: ['renders.ts', '../../puppet/load.ts'],
  eval: ['reader.ts'],
  chain: ['chain.ts', 'chain-fit.ts'],
} as const;

export type SourcedStage = keyof typeof STAGE_ENTRIES;

/** Every stage kind's source files as its inputs. */
export type StageSources = { readonly [K in SourcedStage]: ReadonlyArray<Input> };

/** A stage kind's source files, as absolute paths, sorted. */
export const sourceFiles = (kind: SourcedStage) =>
  importClosure(STAGE_ENTRIES[kind].map((s) => new URL(s, import.meta.url).pathname));

const inputsOf = (kind: SourcedStage) =>
  Effect.map(sourceFiles(kind), (files) => files.map(fileInput));

/** Every stage kind's source files as its inputs. */
export const stageSources: Effect.Effect<
  StageSources,
  PlatformError,
  FileSystem.FileSystem | Path.Path
> = Effect.all({
  parts: inputsOf('parts'),
  cut: inputsOf('cut'),
  fit: inputsOf('fit'),
  renders: inputsOf('renders'),
  eval: inputsOf('eval'),
  chain: inputsOf('chain'),
});
