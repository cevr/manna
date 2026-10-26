import { WebsterService } from '@manna/core/webster';
import { Effect, Schema } from 'effect';
import { Command } from 'effect/cli';
import { expect, it } from 'effect-bun-test';

import { webster } from '../../src/commands/webster.js';
import { runCli } from '../lib/run-cli.js';

const command = webster.pipe(
  Command.provide(() =>
    WebsterService.Test({
      entries: [
        { id: 1, headword: 'dismayed', definition: 'Disheartened; deprived of courage.' },
        { id: 2, headword: 'love', definition: 'Affection.' },
      ],
    }),
  ),
);
const decode = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      query: Schema.String,
      entries: Schema.Array(
        Schema.Struct({ id: Schema.Int, headword: Schema.String, definition: Schema.String }),
      ),
    }),
  ),
);

it.effect(
  'parses direct lookup and multiword search into JSON envelopes through the real CLI',
  () =>
    Effect.gen(function* () {
      const exact = yield* runCli(command, ['dismayed', '--json']);
      expect(exact.success).toBe(true);
      expect(decode(exact.stdout)).toEqual({
        query: 'dismayed',
        entries: [
          { id: 1, headword: 'dismayed', definition: 'Disheartened; deprived of courage.' },
        ],
      });
      const fallback = yield* runCli(command, ['loveth', '--json']);
      expect(decode(fallback.stdout).entries.map((entry) => entry.headword)).toEqual(['love']);
      const searched = yield* runCli(command, [
        'search',
        'deprived',
        'courage',
        '--json',
        '--limit',
        '1',
      ]);
      expect(searched.success).toBe(true);
      expect(decode(searched.stdout).entries.map((entry) => entry.headword)).toEqual(['dismayed']);
      const missing = yield* runCli(command, ['absent', '--json']);
      expect(missing.success).toBe(true);
      expect(decode(missing.stdout).entries).toEqual([]);
    }),
);

it.effect('rejects limits outside 1–100 and exposes help', () =>
  Effect.gen(function* () {
    for (const limit of ['0', '-1', '101', '1.5'])
      expect((yield* runCli(command, ['search', 'courage', '--limit', limit])).success).toBe(false);
    const help = yield* runCli(command, ['--help']);
    expect(help.success).toBe(true);
    expect(help.stdout).toContain('search');
  }),
);
