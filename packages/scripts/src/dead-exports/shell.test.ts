import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path } from 'effect';

import { shellRuns } from './shell.ts';

/** A seeded generator of numbers in [0, 1). */
const random = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

type Next = () => number;

const pick = (next: Next, from: ReadonlyArray<string>): string =>
  from[Math.floor(next() * from.length)] ?? '';

const FILES = ['src/a.ts', 'packages/scripts/src/lint-gate.ts', 'x/y-z.tsx', 'b.ts'];
const FLAGS = ['--no-env-file', '--smol', '--cwd=.', 'run'];
const TAILS = ['', ' &', ' > /tmp/x.log 2>&1', ' --fast', ' --fast > out.log &', ' 2>/dev/null'];
const INDENTS = ['', '  ', '\t'];

/** One generated line, and the files it runs: a `bun` line with a file runs it, every other line none. */
const lineOf = (next: Next): readonly [string, ReadonlyArray<string>] => {
  const indent = pick(next, INDENTS);
  const file = pick(next, FILES);
  const tail = pick(next, TAILS);
  switch (Math.floor(next() * 7)) {
    case 0: {
      const flags = FLAGS.filter(() => next() < 0.3).map((flag) => `${flag} `);
      return [`${indent}bun ${flags.join('')}${file}${tail}`, [file]];
    }
    case 1:
      return [`${indent}# bun ${file} runs here`, []];
    case 2:
      return [`${indent}cd "$(dirname "$0")/../../.."`, []];
    case 3:
      return [`${indent}wait "$lint_pid"`, []];
    case 4:
      return [`${indent}echo "gate: ran ${file}"`, []];
    case 5:
      return ['', []];
    default:
      return [`${indent}bun run lint${tail}`, []];
  }
};

describe('the TypeScript files a shell file runs', () => {
  it.effect(
    'over 300 generated shell texts, the runs are exactly the files of the bun lines, in order, and no comment line names one',
    () =>
      Effect.sync(() => {
        for (let seed = 1; seed <= 300; seed++) {
          const next = random(seed);
          const lines = Array.from({ length: 1 + Math.floor(next() * 12) }, () => lineOf(next));
          const text = lines.map(([line]) => line).join('\n');
          expect({ seed, runs: shellRuns(text) }).toEqual({
            seed,
            runs: lines.flatMap(([, runs]) => runs),
          });
        }
      }),
  );

  it.effect("gate.sh's text runs the lint, the ledger's check and the unit tests", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const text = yield* fs.readFileString(path.join(import.meta.dir, '../gate.sh'));
      expect(shellRuns(text)).toEqual([
        'packages/scripts/src/lint-gate.ts',
        'packages/scripts/src/lessons/check.ts',
        'packages/scripts/src/gate-tests.ts',
      ]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
