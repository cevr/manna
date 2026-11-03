import { describe, expect, it } from 'effect-bun-test';
import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem } from 'effect';
import { CRITIQUE_RULES, JUDGE_RULES } from './rules.ts';

describe('the rules the counsels quote', () => {
  it.effect('every heading is a section of its file', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const read = yield* Effect.forEach([...JUDGE_RULES, ...CRITIQUE_RULES], (rule) =>
        Effect.map(fs.readFileString(rule.file), (text) => ({ rule, lines: text.split('\n') })),
      );
      const missing = read
        .filter(({ rule, lines }) => !lines.some((line) => line.trim() === rule.heading.trim()))
        .map(({ rule }) => `${rule.file}: ${rule.heading}`);
      expect(missing).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
