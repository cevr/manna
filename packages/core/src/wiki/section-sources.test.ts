import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Cause, Effect, Exit, type Layer } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { WikiSectionSources } from './section-composer.js';
import { sectionSourcesOver } from './section-sources.js';

const opens = () => SqliteBun.layer({ filename: ':memory:' });

const willNotOpen = () =>
  SqliteBun.layer({
    filename: '/nonexistent-directory-xyz/bible.db',
    readonly: true,
    readwrite: false,
    create: false,
  });

const sourcingOver = (layer: Layer.Layer<WikiSectionSources>) =>
  Effect.exit(
    Effect.gen(function* () {
      return (yield* WikiSectionSources)._tag;
    }).pipe(Effect.provide(layer)),
  );

const tagOf = (exit: Exit.Exit<string, unknown>) =>
  Exit.match(exit, { onSuccess: (tag) => tag, onFailure: (cause) => Cause.pretty(cause) });

describe('sectionSourcesOver', () => {
  it.effect(
    'a catalog that will not open leaves the sections NotWired, the Bible database open',
    () =>
      Effect.gen(function* () {
        const exit = yield* sourcingOver(
          sectionSourcesOver({ bible: opens(), catalog: willNotOpen(), writings: opens() }),
        );
        expect(tagOf(exit)).toBe('not-wired');
      }),
  );

  it.effect('a Bible database that will not open leaves the sections NotWired', () =>
    Effect.gen(function* () {
      const exit = yield* sourcingOver(
        sectionSourcesOver({ bible: willNotOpen(), catalog: opens(), writings: opens() }),
      );
      expect(tagOf(exit)).toBe('not-wired');
    }),
  );

  it.effect('a writings library that will not open leaves the sections NotWired', () =>
    Effect.gen(function* () {
      const exit = yield* sourcingOver(
        sectionSourcesOver({ bible: opens(), catalog: opens(), writings: willNotOpen() }),
      );
      expect(tagOf(exit)).toBe('not-wired');
    }),
  );

  it.effect('every corpus open wires the sections', () =>
    Effect.gen(function* () {
      const exit = yield* sourcingOver(
        sectionSourcesOver({ bible: opens(), catalog: opens(), writings: opens() }),
      );
      expect(tagOf(exit)).not.toBe('not-wired');
      expect(Exit.isSuccess(exit)).toBe(true);
    }),
  );
});
