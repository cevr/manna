import { Effect, Match, Option, Result } from 'effect';
import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import { ChoiceVerb } from '../core/choice.ts';
import { PointRef } from '../core/point.ts';
import { hashText } from '../core/narration.ts';
import { RenderCatalogue } from './catalogue.ts';
import { type BeatAttempts, filmPoints } from './choice-points.ts';
import { offered, verbFits } from './choices.ts';
import { VerbRefused } from '../core/refusals.ts';
import { heardSource } from '../core/sfx.ts';
import { FilmRepo, type LoadedFilm, placeFilm } from './film-repo.ts';
import { staticLeg } from './film-check.ts';
import { lineOf, report } from './findings.ts';
import {
  OptionsChecked,
  OptionsKept,
  OptionsListed,
  OptionsMixed,
  OptionsSounded,
  OptionsTaken,
  answering,
  printLine,
} from './fresh-film.ts';
import { SoundLibrary } from './library.ts';
import { Media } from './media.ts';
import { Mixer } from './mixer.ts';
import { beatsOf, voicedOf } from './narrator.ts';
import { SoundRender, measuredFilm } from './sound-render.ts';
import { Takes } from './takes.ts';

const film = Argument.String('film').pipe(
  Argument.withDescription('the film, a folder under src/films'),
);

const beatAttempts = Effect.fn('film.options.beats')(function* (loaded: LoadedFilm) {
  const takes = yield* Takes;
  if (Option.isSome(loaded.talk)) return [];
  const beats = yield* Effect.fromResult(beatsOf(loaded));
  return yield* Effect.forEach(beats, (beat) =>
    Effect.map(takes.attempts(loaded.paths, beat.id), (attempts): BeatAttempts => ({
      beat: beat.id,
      hash: hashText(beat.script),
      attempts,
    })),
  );
});

const pointsOf = Effect.fn('film.options.points')(function* (loaded: LoadedFilm) {
  return filmPoints({
    loaded: yield* measuredFilm(loaded),
    placed: yield* placeFilm(loaded),
    beats: yield* beatAttempts(loaded),
    catalogue: Option.some(yield* (yield* RenderCatalogue).read(loaded.paths)),
  });
});

const staticLines = Effect.fn('film.options.static')(function* (loaded: LoadedFilm) {
  const found = yield* staticLeg(loaded, yield* placeFilm(loaded));
  return report(found, { allowStale: true }).findings.map(lineOf);
});

const list = Command.make(
  'list',
  {
    film,
    check: Flag.Boolean('check').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        'also answer the static check of the same sources (what a write answers)',
      ),
    ),
  },
  Effect.fn('film.options.list')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    const points = yield* pointsOf(loaded);
    if (!input.check) return yield* printLine(OptionsListed.make({ points }));
    yield* printLine(OptionsChecked.make({ points, findings: yield* staticLines(loaded) }));
  }, answering),
).pipe(
  Command.withDescription(
    "The film's choice points as its sources stand (and, with --check, its static check), as one line of JSON",
  ),
);

const take = Command.make(
  'take',
  {
    film,
    point: Flag.String('point').pipe(Flag.withDescription('the take point: take:<sound>')),
    variant: Flag.String('variant').pipe(Flag.withDescription('the take, by its sha256')),
    verb: Flag.Literals('verb', ChoiceVerb.literals).pipe(
      Flag.withDescription('pick keeps it, unpick unkeeps it, reject rejects it'),
    ),
  },
  Effect.fn('film.options.take')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    const found = Result.flatMap(
      offered(input.film, yield* pointsOf(loaded), input.point, input.variant),
      (at) => Result.map(verbFits(at.point, at.variant, input.verb), () => at),
    );
    if (Result.isFailure(found)) return yield* found.failure;
    const { point, variant } = found.success;
    const { ref } = point;
    if (!PointRef.guards.Take(ref))
      return yield* VerbRefused.make({
        point: point.id,
        variant: variant.id,
        verb: input.verb,
        reason: `a ${point.kind} is not a library take`,
      });
    const library = yield* SoundLibrary;
    const { sound } = ref;
    yield* Match.value(input.verb).pipe(
      Match.when('pick', () => library.keep(sound, [variant.id])),
      Match.when('unpick', () => library.unkeep(sound, [variant.id])),
      Match.orElse(() => library.reject(sound, [variant.id])),
    );
    yield* printLine(OptionsTaken.make({}));
  }, answering),
).pipe(Command.withDescription("Keep, unkeep or reject one of a sound's takes, by its sha256"));

const mix = Command.make(
  'mix',
  {
    film,
    point: Flag.String('point').pipe(Flag.withDescription('the choice point: score, take:<sound>')),
    variant: Flag.String('variant').pipe(
      Flag.withDescription("the variant to play: a score option, a take sha256, a seed's label"),
    ),
    to: Flag.String('to').pipe(Flag.withDescription('the m4a to write')),
  },
  Effect.fn('film.options.mix')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    const found = offered(input.film, yield* pointsOf(loaded), input.point, input.variant);
    if (Result.isFailure(found)) return yield* found.failure;
    const { point, variant } = found.success;
    const ref = Option.some(point.ref);
    const score = Option.filter(ref, PointRef.guards.Score);
    const take = Option.map(Option.filter(ref, PointRef.guards.Take), (r) => ({
      sound: r.sound,
      take: variant.id,
    }));
    if (Option.isNone(score) && Option.isNone(take))
      return yield* VerbRefused.make({
        point: point.id,
        variant: variant.id,
        verb: 'hear in place',
        reason: `a ${point.kind} is not heard in the mix`,
      });
    const { mixed } = yield* (yield* Mixer).render(input.film, {
      warn: false,
      score: Option.as(score, variant.id),
      take,
    });
    yield* (yield* Media).writeAac(input.to, mixed.master);
    yield* printLine(OptionsMixed.make({}));
  }, answering),
).pipe(Command.withDescription("The film's whole mix with one variant in place, as an m4a"));

const sound = Command.make(
  'sound',
  {
    film,
    point: Flag.String('point').pipe(Flag.withDescription('the take point: take:<sound>')),
    variant: Flag.String('variant').pipe(Flag.withDescription("the seed, by its source's label")),
    to: Flag.String('to').pipe(Flag.withDescription('the WAV to write')),
  },
  Effect.fn('film.options.sound')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    const found = offered(input.film, yield* pointsOf(loaded), input.point, input.variant);
    if (Result.isFailure(found)) return yield* found.failure;
    const { point, variant } = found.success;
    const notMade = () =>
      VerbRefused.make({
        point: point.id,
        variant: variant.id,
        verb: 'hear alone',
        reason: 'it is not made from data',
      });
    const { ref } = point;
    if (!PointRef.guards.Take(ref)) return yield* notMade();
    const source = yield* Effect.fromOption(
      heardSource(loaded.sounds, ref.sound, variant.id),
      notMade,
    );
    yield* (yield* Media).writeWav(input.to, yield* (yield* SoundRender).pcm(source));
    yield* printLine(OptionsSounded.make({}));
  }, answering),
).pipe(
  Command.withDescription("A seed of a sound made from data, by its source's label, as a WAV"),
);

const keepVoice = Command.make(
  'keep-voice',
  {
    film,
    beat: Argument.String('beat').pipe(Argument.withDescription('the beat, a scene id')),
    file: Argument.String('file').pipe(
      Argument.withDescription('the attempt to keep, as its beat lists it'),
    ),
    acceptMismatch: Flag.Boolean('accept-mismatch').pipe(
      Flag.withDefault(false),
      Flag.withDescription('keep it even when its transcript does not match its line'),
    ),
  },
  Effect.fn('film.options.keepVoice')(function* (input) {
    const voiced = yield* Effect.fromResult(voicedOf(yield* (yield* FilmRepo).load(input.film)));
    const kept = yield* (yield* Takes).keepAttempt(voiced, input.beat, input.file, {
      acceptMismatch: input.acceptMismatch,
    });
    const mixed = yield* (yield* Mixer)
      .mix(input.film, { stems: false, score: Option.none() })
      .pipe(
        Effect.as(true),
        Effect.catch((error) =>
          Effect.logWarning(
            `options.keep-voice.mix.failed film=${input.film} tag=${error._tag} reason=${error.message}`,
          ).pipe(Effect.as(false)),
        ),
      );
    yield* printLine(
      OptionsKept.make({ take: kept.take, heard: kept.heard, wer: kept.wer, mixed }),
    );
  }, answering),
).pipe(Command.withDescription("Keep a beat's attempt as its take, and remix the track"));

export const options = Command.make('options').pipe(
  Command.withDescription(
    "A film's choices, their mixes, a seed alone, a take or a voice kept, read fresh from disk (what the lab's review asks)",
  ),
  Command.withSubcommands([list, mix, sound, take, keepVoice]),
);
