import { parseBibleQuery } from '@manna/core/bible';
import {
  StrongsNumber,
  StrongsStudyJson,
  StudyCorpusDataError,
  StudyLimit,
  StudyService,
  VerseStudyJson,
  type StrongsStudy,
  type VerseStudy,
} from '@manna/core/study';
import { layerBunStudy } from '@manna/core/study/bun';
import { BunServices } from '@effect/platform-bun';
import {
  Config,
  Console,
  Context,
  Effect,
  Layer,
  Option,
  Path,
  Schema,
  SchemaGetter,
} from 'effect';
import { Argument, Command, Flag } from 'effect/cli';

const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);

const encodeJson = Schema.encodeUnknownEffect(JsonString);

const encodeVerse = Schema.encodeEffect(VerseStudyJson);
const encodeStrongs = Schema.encodeEffect(StrongsStudyJson);

const json = Flag.Boolean('json').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Emit stable JSON'),
);

const limit = Flag.Int('limit').pipe(
  Flag.withSchema(StudyLimit),
  Flag.optional,
  Flag.withDescription('How many concordance occurrences to list'),
);

const installedStudyLayer = Layer.unwrap(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* Config.String('HOME');
    return layerBunStudy({
      bible: path.join(home, '.bible', 'bible.db'),
      writings: path.join(home, '.bible', 'egw-paragraphs.db'),
    });
  }).pipe(Effect.provide(BunServices.layer), Effect.orDie),
).pipe(Layer.provide(BunServices.layer));

export class StudyLayer extends Context.Reference<Layer.Layer<StudyService>>(
  '@manna/cli/study/StudyLayer',
  { defaultValue: () => installedStudyLayer },
) {}

const studyService = <A, E>(use: Effect.Effect<A, E, StudyService>): Effect.Effect<A, E> =>
  Effect.flatMap(StudyLayer, (layer) => use.pipe(Effect.provide(layer)));

const writingRefcode = (entry: {
  readonly refcode: Option.Option<string>;
  readonly bookCode: string;
}): string => Option.getOrElse(entry.refcode, () => entry.bookCode);

const isCorpusRowFailure = Schema.is(StudyCorpusDataError);

const reportCorpusRow = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.tapError(effect, (cause) => {
    if (!isCorpusRowFailure(cause)) return Effect.void;
    return Console.error(
      `malformed ${cause.source} row in ${cause.operation}: ${cause.row} — ${cause.message}`,
    );
  });

export const verseStudyJson = (
  bundle: VerseStudy,
): Effect.Effect<VerseStudyJson, Schema.SchemaError> => encodeVerse(bundle);

const reference = Argument.String('reference').pipe(
  Argument.withDescription('A Bible verse reference, e.g. "Dan 8:13"'),
);

class NotOneVerseError extends Schema.TaggedError<NotOneVerseError>()('NotOneVerseError', {
  reference: Schema.String,
}) {
  override get message(): string {
    return `Not a single-verse reference: "${this.reference}". Try a form like "Dan 8:13".`;
  }
}

const singleVerse = (input: string) => {
  const parsed = parseBibleQuery(input);
  if (parsed._tag !== 'single') {
    return Effect.fail(NotOneVerseError.make({ reference: input }));
  }
  return Effect.succeed(parsed.ref);
};

const studyVerse = Command.make('verse', { reference, json }, (args) =>
  Effect.gen(function* () {
    const target = yield* singleVerse(args.reference);
    const bundle = yield* studyService(
      Effect.flatMap(StudyService, (service) => service.verse(target)),
    );

    if (args.json) {
      yield* Console.log(yield* encodeJson(yield* verseStudyJson(bundle)));
      return;
    }

    yield* Console.log(bundle.label);
    yield* Option.match(bundle.text, {
      onNone: () => Console.log('(text unavailable)'),
      onSome: (text) => Console.log(text),
    });
    yield* Console.log(``);

    const tapTargets = bundle.words.filter((word) => word.strongs.length > 0);
    yield* Console.log(`## words  ${String(tapTargets.length)}/${String(bundle.words.length)}`);
    for (const word of tapTargets) {
      yield* Console.log(`  ${word.text}  ${word.strongs.join(' ')}`);
    }

    yield* Console.log(`## cross-references  ${String(bundle.crossRefs.length)}`);
    for (const crossRef of bundle.crossRefs) {
      yield* Console.log(`  ${crossRef.label}  [${crossRef.source}]`);
    }

    yield* Console.log(`## margin-notes  ${String(bundle.marginNotes.length)}`);
    for (const note of bundle.marginNotes) {
      yield* Console.log(`  ${note.phrase}: ${note.text}  [${note.kind}]`);
    }

    yield* Console.log(`## commentary  ${String(bundle.commentary.length)}`);
    for (const entry of bundle.commentary) {
      yield* Console.log(`  ${writingRefcode(entry)}  ${entry.bookTitle}`);
    }

    yield* Console.log(
      `## parallel-writings  ${String(bundle.parallelWritings.length)}/${String(
        bundle.parallelWritingsTotal,
      )}`,
    );
    for (const entry of bundle.parallelWritings) {
      yield* Console.log(`  ${writingRefcode(entry)}  ${entry.bookTitle}`);
    }
  }).pipe(reportCorpusRow, Effect.provide(BunServices.layer)),
);

export const strongsStudyJson = (
  result: StrongsStudy,
): Effect.Effect<StrongsStudyJson, Schema.SchemaError> => encodeStrongs(result);

const number = Argument.String('number').pipe(
  Argument.withDescription("A Strong's number, e.g. H8548"),
);

const studyStrongs = Command.make('strongs', { number, limit, json }, (args) =>
  Effect.gen(function* () {
    const target = yield* Schema.decodeEffect(StrongsNumber)(args.number);
    const result = yield* studyService(
      Effect.flatMap(StudyService, (service) =>
        service.strongs(target, { limit: Option.getOrUndefined(args.limit) }),
      ),
    );

    if (args.json) {
      yield* Console.log(yield* encodeJson(yield* strongsStudyJson(result)));
      return;
    }

    yield* Option.match(result.entry, {
      onNone: () => Console.log(`${result.number}  (no lexicon entry)`),
      onSome: (entry) =>
        Effect.gen(function* () {
          yield* Console.log(`${entry.number}  ${entry.lemma}  [${entry.language}]`);
          yield* Option.match(entry.transliteration, {
            onNone: () => Effect.void,
            onSome: (value) => Console.log(`  ${value}`),
          });
          yield* Console.log(`  ${entry.definition}`);
        }),
    });
    yield* Console.log(``);
    yield* Console.log(
      `## occurrences  ${String(result.occurrences.length)}/${String(result.total)}`,
    );
    for (const occurrence of result.occurrences) {
      yield* Console.log(`  ${occurrence.label}  ${occurrence.word}`);
    }
  }).pipe(reportCorpusRow, Effect.provide(BunServices.layer)),
);

export const study = Command.make('study', {}, () =>
  Console.log(
    `Usage: manna study verse "<reference>" [--json]\n` +
      `       manna study strongs <number> [--limit <n>] [--json]`,
  ),
).pipe(Command.withSubcommands([studyVerse, studyStrongs]));
