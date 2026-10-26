/**
 * `bun scripts/feel-candidates.ts --out <dir>`: the dials' sound candidates
 * as WAV files, for the owner to pick by ear (`src/feel/voice.ts`, `THOCKS`
 * and `TONES`), and a `README.txt` that names each file.
 *
 * Each candidate gets three takes, each a 16-bit mono WAV at the voice's
 * rate:
 * - `one`: one detent (a key tone's is C);
 * - `slow`: a slow turn of 12 detents, 300 ms apart (a key tone's runs C up
 *   to B);
 * - `fling`: a fast fling of 20 detents, 17 ms apart (3,000 pt/s over 52 pt
 *   detents), told to the Feel itself (`feelOver`), so the take holds only
 *   the sounds the app would play: a sound that would start over the last
 *   one is dropped.
 *
 * The README marks the candidates the app plays now (`PICKED`). Nothing here
 * plays a sound.
 */

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, FileSystem, Path } from 'effect';
import { Command, Flag } from 'effect/cli';

import type { SoundName } from '../src/feel/body.ts';
import type { DialName } from '../src/feel/cue.ts';
import { feelOver } from '../src/feel/feel.ts';
import {
  lengthMs,
  PICKED,
  RATE,
  type Recipe,
  recipesOf,
  samplesOf,
  THOCKS,
  TONES,
  wavOf,
} from '../src/feel/voice.ts';

/** A take of a candidate: how its detents are told. */
export const TAKES = [
  { take: 'one', count: 1, gap: 0 },
  { take: 'slow', count: 12, gap: 300 },
  { take: 'fling', count: 20, gap: 17 },
] as const;

export type Kind = 'thock' | 'tone';

/** A rendered take: its file's name, what it is, how many detents were told and how many sounded, and its bytes. */
export interface CandidateFile {
  readonly file: string;
  readonly kind: Kind;
  readonly candidate: string;
  readonly about: string;
  readonly picked: boolean;
  readonly take: (typeof TAKES)[number]['take'];
  readonly told: number;
  /** Each sound that played: when it started, in milliseconds from the take's start, and how long its file is. */
  readonly sounded: ReadonlyArray<{ readonly at: number; readonly ms: number }>;
  readonly ms: number;
  readonly wav: Uint8Array;
}

/** A sound that holds nothing, for a name a candidate's voice holds none of. */
const SILENT: Recipe = { level: 0, layers: [] };

const recipeOf = (recipes: ReadonlyMap<SoundName, Recipe>, sound: SoundName) =>
  recipes.get(sound) ?? SILENT;

/** The detents of a take: `count` of them on `dial`, `gap` ms apart, told to a Feel over these sounds. */
const told = (
  dial: DialName,
  count: number,
  gap: number,
  recipes: ReadonlyMap<SoundName, Recipe>,
) => {
  let clock = 0;
  const heard: Array<readonly [number, SoundName]> = [];
  const tell = feelOver({
    haptics: { play: () => {} },
    sound: {
      play: (sound) => void heard.push([clock, sound]),
      length: (sound) => lengthMs(recipeOf(recipes, sound)),
    },
    on: () => true,
    now: () => clock,
  });
  for (let n = 0; n < count; n += 1) {
    clock = n * gap;
    tell({ _tag: 'detent', dial, at: n % 12 });
  }
  return heard;
};

/** The sounds `heard`, each at its start, mixed into one take. */
const mix = (
  heard: ReadonlyArray<readonly [number, SoundName]>,
  recipes: ReadonlyMap<SoundName, Recipe>,
) => {
  const rendered = heard.map(([at, sound]) => {
    const recipe = recipeOf(recipes, sound);
    return { start: Math.round((at / 1000) * RATE), samples: samplesOf(sound, recipe) };
  });
  const out = new Float64Array(Math.max(0, ...rendered.map((r) => r.start + r.samples.length)));
  for (const { start, samples } of rendered)
    samples.forEach((s, i) => {
      out[start + i] = (out[start + i] ?? 0) + s;
    });
  return out;
};

/** Every candidate's three takes. */
export const candidateFiles = (): ReadonlyArray<CandidateFile> => {
  const kinds = [
    ...Object.entries(THOCKS).map(([name, c]) => ({
      kind: 'thock' as const,
      name,
      about: c.about,
      picked: name === PICKED.thock,
      dial: 'capo' as const,
      recipes: new Map(recipesOf(c.recipe, TONES[PICKED.tone].recipe)),
    })),
    ...Object.entries(TONES).map(([name, c]) => ({
      kind: 'tone' as const,
      name,
      about: c.about,
      picked: name === PICKED.tone,
      dial: 'key' as const,
      recipes: new Map(recipesOf(THOCKS[PICKED.thock].recipe, c.recipe)),
    })),
  ];
  return kinds.flatMap(({ kind, name, about, picked, dial, recipes }) =>
    TAKES.map(({ take, count, gap }, k) => {
      const heard = told(dial, count, gap, recipes);
      const samples = mix(heard, recipes);
      return {
        file: `${kind}-${name}-${k + 1}-${take}.wav`,
        kind,
        candidate: name,
        about,
        picked,
        take,
        told: count,
        sounded: heard.map(([at, sound]) => ({ at, ms: lengthMs(recipeOf(recipes, sound)) })),
        ms: Math.round((samples.length / RATE) * 1000),
        wav: wavOf(samples),
      };
    }),
  );
};

const TAKE_LINES: Record<(typeof TAKES)[number]['take'], string> = {
  one: 'one detent',
  slow: 'a slow turn: 12 detents, 300 ms apart',
  fling: 'a fast fling: 20 detents, 17 ms apart, as the app plays it',
};

/** The README that names each file. */
export const readmeOf = (files: ReadonlyArray<CandidateFile>): string => {
  const kinds: ReadonlyArray<readonly [Kind, string]> = [
    ['thock', 'The thock: the capo and text-size dials. Pick one.'],
    ['tone', 'The key tone: the key dial, at each key. Pick one.'],
  ];
  const sections = kinds.map(([kind, title]) => {
    const ofKind = files.filter((f) => f.kind === kind);
    const names = [...new Set(ofKind.map((f) => f.candidate))];
    const blocks = names.map((name) => {
      const takes = ofKind.filter((f) => f.candidate === name);
      const first = takes[0];
      const head = `${name}${(first?.picked && ' (recommended: the app plays it now)') || ''}: ${first?.about ?? ''}`;
      const lines = takes.map(
        (f) =>
          `  ${f.file}  ${TAKE_LINES[f.take]} (${f.sounded.length} of ${f.told} sounded, ${f.ms} ms)`,
      );
      return [head, ...lines].join('\n');
    });
    return [title, ...blocks].join('\n\n');
  });
  return `${[
    'The dials’ sound candidates. Each file is a 16-bit mono WAV at 24 kHz.',
    'In a fast fling a sound starts only once the last one has ended, so a longer sound plays fewer times.',
    ...sections,
  ].join('\n\n')}\n`;
};

const feelCandidates = Command.make(
  'feel-candidates',
  { out: Flag.String('out').pipe(Flag.withDescription('where the WAV files and README.txt go')) },
  (flags) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.makeDirectory(flags.out, { recursive: true });
      const files = candidateFiles();
      for (const f of files) yield* fs.writeFile(path.join(flags.out, f.file), f.wav);
      yield* fs.writeFileString(path.join(flags.out, 'README.txt'), readmeOf(files));
      yield* Console.log(`[feel-candidates] ${files.length} files and README.txt in ${flags.out}`);
    }),
);

if (import.meta.main)
  Command.run(feelCandidates, { version: '1.0.0' }).pipe(
    Effect.provide(BunServices.layer),
    (program) => BunRuntime.runMain(program),
  );
