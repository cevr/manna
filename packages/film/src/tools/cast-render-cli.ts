// `film concept render <film> <member> [--kind turnaround|poses|heads ...]
// [--view <kind>-<view> ...] [--figure rig|cutout] [--boil <px>] [--no-critique] [--fit-only]`: the member's cast
// render (`cast-render.ts`), each kept view asked (every view of every kind
// kept when none) drawn by its rig from the film's `rigs/cast.ts` (or, with
// `--figure cutout`, each view its `CUTOUT` table has, by its puppet, its boil
// `--boil` px: the house 0.6 or 0, written in the record), laid
// beside its kept view, held to its fit rows and critiqued once every row
// passes; a line a view, its flagged rows, its fit and findings under it.
// `--fit-only` prints each view's fit rows and writes nothing: the fast loop.
//
// `film concept render <film> <member> --render <n> --finding
// <kind>-<view>/<id> --stands "<why>"`: answer a finding of render n, that it
// stands and why, in its `render.json` and `render.md`. A finding fixed is
// fixed by a new render, never answered on the old one.

import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import { Console, Effect, Layer, Option, Schema } from 'effect';
import { BOIL_AMP } from '../core/boil.ts';
import type { CritiqueRule } from '../core/critique.ts';
import { castViewLines, fitRowLines } from '../core/cast-render.ts';
import { SheetKind } from '../core/cast-sheet.ts';
import { answerCast, renderCast } from './cast-render.ts';
import { Counsel } from './counsel.ts';
import { Critic } from './critique.ts';
import { filmNamed } from './film-repo.ts';
import type { Pages } from './pages.ts';

/** An answer asked with only some of `--render`, `--finding` and `--stands`. */
class AnswerIncomplete extends Schema.TaggedError<AnswerIncomplete>()('AnswerIncomplete', {}) {
  override get message() {
    return 'an answer names all three: --render <n> --finding <kind>-<view>/<id> --stands "<why>"';
  }
}

/** `film concept render`, drawing on `pages` (the app's export pages), critiqued over the app's figure rules. */
export const render = <E, R>(pages: Layer.Layer<Pages, E, R>, rules: ReadonlyArray<CritiqueRule>) =>
  Command.make(
    'render',
    {
      film: Argument.String('film').pipe(
        Argument.withDescription('the film whose rigs/cast.ts draws him'),
      ),
      member: Argument.String('member').pipe(
        Argument.withDescription('the cast member, by its id'),
      ),
      kind: Flag.Literals('kind', SheetKind.literals).pipe(
        Flag.atLeast(0),
        Flag.withDescription(
          'a sheet to draw: turnaround, poses or heads (every kept one when none)',
        ),
      ),
      view: Flag.String('view').pipe(
        Flag.atLeast(0),
        Flag.withDescription(
          'a kept view to draw, <kind>-<view> (every view of each kind when none)',
        ),
      ),
      critique: Flag.Boolean('critique').pipe(
        Flag.withDefault(true),
        Flag.withDescription(
          'show each view whose fit rows all pass to a fresh model (--no-critique skips it, written as skipped)',
        ),
      ),
      figure: Flag.Literals('figure', ['rig', 'cutout'] as const).pipe(
        Flag.withDefault('rig' as const),
        Flag.withDescription(
          'what draws each view: its rig (rigs/cast.ts CAST, the default) or its puppet cut from the kept sheet (CUTOUT)',
        ),
      ),
      boil: Flag.Finite('boil').pipe(
        Flag.withDefault(BOIL_AMP),
        Flag.withDescription(
          `how far a cut-out's boil moves its figure, px: the house ${BOIL_AMP} by default, 0 for none (a rig ignores it)`,
        ),
      ),
      fitOnly: Flag.Boolean('fit-only').pipe(
        Flag.withDefault(false),
        Flag.withDescription("print each view's fit rows alone: no critique, nothing written"),
      ),
      render: Flag.Int('render').pipe(
        Flag.optional,
        Flag.withDescription('the render whose finding is answered'),
      ),
      finding: Flag.String('finding').pipe(
        Flag.optional,
        Flag.withDescription('the finding answered, <kind>-<view>/<id>'),
      ),
      stands: Flag.String('stands').pipe(
        Flag.optional,
        Flag.withDescription('why the finding stands'),
      ),
    },
    Effect.fn('film.concept.render')(function* (input) {
      const film = yield* filmNamed(input.film);
      const answer = [
        Option.isSome(input.render),
        Option.isSome(input.finding),
        Option.isSome(input.stands),
      ].filter(Boolean).length;
      if (answer > 0) {
        if (answer < 3) return yield* AnswerIncomplete.make({});
        const n = Option.getOrThrow(input.render);
        const finding = Option.getOrThrow(input.finding);
        yield* answerCast(film, input.member, n, finding, Option.getOrThrow(input.stands));
        return yield* Console.log(`answered ${input.member} render ${n} ${finding}: stands`);
      }
      const made = yield* Effect.scoped(
        renderCast(film, input.member, {
          kinds: input.kind,
          views: input.view,
          critique: input.critique,
          fitOnly: input.fitOnly,
          figure: input.figure,
          boil: input.boil,
        }),
      );
      yield* Console.log(
        `render ${input.member} n=${made.render.n} views=${made.render.views.length} riv=${made.render.riv.slice(0, 12)} ${Option.getOrElse(made.dir, () => '(fit only, nothing written)')}`,
      );
      for (const line of made.render.views.flatMap(castViewLines)) yield* Console.log(line);
      if (input.fitOnly)
        for (const line of made.render.views.flatMap(fitRowLines)) yield* Console.log(line);
    }),
  ).pipe(
    Command.provide(Layer.mergeAll(pages, Critic.layer(rules).pipe(Layer.provide(Counsel.layer)))),
    Command.withDescription(
      "Render a cast member's rigs in every kept view of his sheets, each beside its kept view at 1:1, measured and critiqued (out/<film>/cast/<member>/render/<n>/); or answer a finding of a render, that it stands and why",
    ),
  );
