// The source files whose code makes each stage kind's bytes. Every stage of
// a kind takes each of its files as an input, so a change to the sampler, the
// puppet, the fit render or the chain stales the stages it makes, with no
// VERSION bump; VERSION (`stages.ts`) stays for a change of meaning outside
// these files. The train is keyed by the reader's own files
// (`CastReader.sources`), and drawing, trainset and ask stages make their
// bytes from their inputs alone. Paths are from this folder; this module
// imports nothing, so a unit test reads it.

import { fileInput, type Input } from './graph.ts';

export const STAGE_SOURCES = {
  parts: ['../part-sheet-cli.ts', '../part-sheet-lay.ts'],
  cut: ['stages.ts'],
  fit: [
    '../cast-render.ts',
    '../../core/fit-rows.ts',
    '../../core/match.ts',
    '../../core/figure.ts',
    '../../core/puppet.ts',
    '../../core/raster.ts',
    '../../puppet/load.ts',
  ],
  renders: [
    'renders.ts',
    '../../core/pose-sample.ts',
    '../../core/puppet.ts',
    '../../puppet/load.ts',
  ],
  eval: ['reader.ts'],
  chain: [
    'chain.ts',
    'chain-fit.ts',
    '../../core/pose-fit.ts',
    '../../core/puppet.ts',
    'reader.ts',
  ],
} as const;

export type SourcedStage = keyof typeof STAGE_SOURCES;

/** A stage kind's source files, as absolute paths. */
export const sourceFiles = (kind: SourcedStage): ReadonlyArray<string> =>
  STAGE_SOURCES[kind].map((s) => new URL(s, `file://${import.meta.dir}/`).pathname);

/** A stage kind's source files as its inputs. */
export const sourceInputs = (kind: SourcedStage): ReadonlyArray<Input> =>
  sourceFiles(kind).map(fileInput);
