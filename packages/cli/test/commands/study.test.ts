import {
  StrongsStudyJson,
  StudyService,
  VerseStudyJson,
  strongsNumber,
  type StrongsStudy,
  type VerseStudy,
} from '@manna/core/study';
import {
  FIXTURE_BOOK,
  FIXTURE_CHAPTER,
  FIXTURE_MALFORMED_ROW,
  FIXTURE_VERSE,
  malformedStudyFixtureLayer,
  studyFixtureLayer,
} from '@manna/core/study/testing';
import { describe, expect, it } from 'effect-bun-test';
import { VerseReference } from '@manna/core/bible';
import type { Layer } from 'effect';
import { Effect, Option, Schema, SchemaGetter } from 'effect';

import { StudyLayer, strongsStudyJson, study, verseStudyJson } from '../../src/commands/study.js';
import { runCli } from '../lib/run-cli.js';

const fixture: Layer.Layer<StudyService> = studyFixtureLayer;

const runStudy = (args: readonly string[]) =>
  runCli(study, [...args], {}).pipe(Effect.provideService(StudyLayer, fixture));

const JsonText = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);

const serialize = Schema.encodeUnknownEffect(JsonText);

const verseWireText = (bundle: VerseStudy): Effect.Effect<string, Schema.SchemaError> =>
  Effect.flatMap(Schema.encodeEffect(VerseStudyJson)(bundle), serialize);

const strongsWireText = (result: StrongsStudy): Effect.Effect<string, Schema.SchemaError> =>
  Effect.flatMap(Schema.encodeEffect(StrongsStudyJson)(result), serialize);

const askStudy = <A, E>(use: Effect.Effect<A, E, StudyService>): Effect.Effect<A, E> =>
  use.pipe(Effect.provide(fixture));

describe('manna study verse --json', () => {
  it.effect("prints the study service's bundle through the core codec", () =>
    Effect.gen(function* () {
      const result = yield* runStudy(['verse', 'Dan 8:13', '--json']);
      expect(result.success).toBe(true);

      const bundle = yield* askStudy(
        Effect.flatMap(StudyService, (service) =>
          service.verse(
            VerseReference.make({
              _tag: 'verse',
              book: FIXTURE_BOOK,
              chapter: FIXTURE_CHAPTER,
              verse: FIXTURE_VERSE,
            }),
          ),
        ),
      );

      expect(result.stdout).toBe(yield* verseWireText(bundle));

      expect(result.stdout.length).toBeGreaterThan(0);
      expect(result.stdout).toContain('"parallelWritings"');
      expect(result.stdout).toContain('"marginNotes"');
      expect(result.stdout).toContain('"5BC"');
      expect(result.stdout).toContain('"GC"');
    }),
  );

  it.effect('renders the five sections for a human reader', () =>
    Effect.gen(function* () {
      const result = yield* runStudy(['verse', 'Dan 8:13']);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Daniel 8:13');
      expect(result.stdout).toContain('## words');
      expect(result.stdout).toContain('## cross-references');
      expect(result.stdout).toContain('## margin-notes');
      expect(result.stdout).toContain('## commentary');
      expect(result.stdout).toContain('## parallel-writings  1/1');
    }),
  );

  it.effect('refuses a reference that does not name one verse', () =>
    Effect.gen(function* () {
      const result = yield* runStudy(['verse', 'Dan 8', '--json']);
      expect(result.success).toBe(false);
    }),
  );
});

describe('manna study strongs --json', () => {
  it.effect("prints the study service's Strong's result through the core codec", () =>
    Effect.gen(function* () {
      const result = yield* runStudy(['strongs', 'H8548', '--json']);
      expect(result.success).toBe(true);

      const direct = yield* askStudy(
        Effect.flatMap(StudyService, (service) => service.strongs(strongsNumber('H8548'))),
      );

      expect(result.stdout).toBe(yield* strongsWireText(direct));
      expect(result.stdout).toContain('"occurrences"');
      expect(result.stdout).toContain('"total"');
    }),
  );

  it.effect("passes --limit through to the service's cap", () =>
    Effect.gen(function* () {
      const result = yield* runStudy(['strongs', 'H8548', '--limit', '3', '--json']);
      expect(result.success).toBe(true);

      const direct = yield* askStudy(
        Effect.flatMap(StudyService, (service) =>
          service.strongs(strongsNumber('H8548'), { limit: 3 }),
        ),
      );

      expect(result.stdout).toBe(yield* strongsWireText(direct));
      expect(direct.occurrences.length).toBe(3);
    }),
  );

  it.effect('accepts a lowercase number, decoding it the way the schema does', () =>
    Effect.gen(function* () {
      const result = yield* runStudy(['strongs', 'h8548']);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('H8548');
    }),
  );

  it.effect('refuses a number the schema would refuse', () =>
    Effect.gen(function* () {
      const result = yield* runStudy(['strongs', '8548']);
      expect(result.success).toBe(false);
    }),
  );

  it.effect('refuses a leading-zero number at this seam too', () =>
    Effect.gen(function* () {
      const result = yield* runStudy(['strongs', 'H0001']);
      expect(result.success).toBe(false);
    }),
  );

  it.effect('refuses --limit 0, as the service schema does', () =>
    Effect.gen(function* () {
      const result = yield* runStudy(['strongs', 'H8548', '--limit', '0']);
      expect(result.success).toBe(false);
    }),
  );

  it.effect('still accepts a positive --limit', () =>
    Effect.gen(function* () {
      const result = yield* runStudy(['strongs', 'H8548', '--limit', '2']);
      expect(result.success).toBe(true);
    }),
  );
});

describe('the CLI encoders are the core schemas', () => {
  it.effect('emits the bundle through the core schema, not a CLI-local projection', () =>
    Effect.gen(function* () {
      const bundle = yield* Effect.flatMap(StudyService, (service) =>
        service.verse(
          VerseReference.make({
            _tag: 'verse',
            book: FIXTURE_BOOK,
            chapter: FIXTURE_CHAPTER,
            verse: FIXTURE_VERSE,
          }),
        ),
      );

      expect(yield* verseStudyJson(bundle)).toEqual(
        yield* Schema.encodeEffect(VerseStudyJson)(bundle),
      );
    }).pipe(Effect.provide(fixture)),
  );

  it.effect("emits the Strong's study through the core schema", () =>
    Effect.gen(function* () {
      const result = yield* Effect.flatMap(StudyService, (service) =>
        service.strongs(strongsNumber('H8548')),
      );

      expect(yield* strongsStudyJson(result)).toEqual(
        yield* Schema.encodeEffect(StrongsStudyJson)(result),
      );
      expect(Option.isSome(result.entry)).toBe(true);
    }).pipe(Effect.provide(fixture)),
  );
});

describe('manna study verse against a malformed corpus row', () => {
  const runMalformed = (args: readonly string[]) =>
    runCli(study, [...args], {}).pipe(
      Effect.provideService(StudyLayer, malformedStudyFixtureLayer),
    );

  it.effect('names the corpus, the section and the row on stderr', () =>
    Effect.gen(function* () {
      const result = yield* runMalformed(['verse', 'Dan 8:13']);

      expect(result.success).toBe(false);

      expect(result.stderr).toContain(FIXTURE_MALFORMED_ROW);
      expect(result.stderr).toContain('verse.parallelWritings');
      expect(result.stderr).toContain('writings');
    }),
  );

  it.effect('keeps the diagnostic out of stdout, where --json pipes', () =>
    Effect.gen(function* () {
      const result = yield* runMalformed(['verse', 'Dan 8:13', '--json']);
      expect(result.success).toBe(false);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(FIXTURE_MALFORMED_ROW);
    }),
  );
});
