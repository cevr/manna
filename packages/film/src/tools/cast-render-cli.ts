// `film concept render <film> <member> [--kind turnaround|poses|heads ...]
// [--no-critique]`: the member's cast render (`cast-render.ts`), each kept
// view of each kind asked (every kind kept when none) drawn by its rig from
// the film's `rigs/cast.ts`, laid beside its kept view, measured and
// critiqued; a line a view, its flagged rows and findings under it.
//
// `film concept render <film> <member> --render <n> --finding
// <kind>-<view>/<id> --stands "<why>"`: answer a finding of render n, that it
// stands and why, in its `render.json` and `render.md`. A finding fixed is
// fixed by a new render, never answered on the old one.

import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import { Array as Arr, Console, Effect, Layer, Option, Schema } from 'effect';
import type { CritiqueRule } from '../core/critique.ts';
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
      critique: Flag.Boolean('critique').pipe(
        Flag.withDefault(true),
        Flag.withDescription(
          'show each view to a fresh model (--no-critique skips it, written as skipped)',
        ),
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
        renderCast(film, input.member, { kinds: input.kind, critique: input.critique }),
      );
      yield* Console.log(
        `render ${input.member} n=${made.render.n} views=${made.render.views.length} riv=${made.render.riv.slice(0, 12)} ${made.dir}`,
      );
      for (const v of made.render.views) {
        const flagged = Arr.match(
          v.rows.filter((r) => r.flagged).map((r) => r.name),
          { onEmpty: () => 'none', onNonEmpty: (names) => names.join(',') },
        );
        const unmatched = Option.match(Option.fromUndefinedOr(v.unmatched), {
          onNone: () => '',
          onSome: (why) => ` unmatched="${why}"`,
        });
        yield* Console.log(
          `${v.kind}-${v.view}: rows=${v.rows.length} flagged=${flagged}${unmatched} critique=${v.critique} findings=${v.findings.length}`,
        );
        for (const f of v.findings)
          yield* Console.log(`  ${v.kind}-${v.view}/${f.id} ${f.aspect}: ${f.what}`);
      }
    }),
  ).pipe(
    Command.provide(Layer.mergeAll(pages, Critic.layer(rules).pipe(Layer.provide(Counsel.layer)))),
    Command.withDescription(
      "Render a cast member's rigs in every kept view of his sheets, each beside its kept view at 1:1, measured and critiqued (out/<film>/cast/<member>/render/<n>/); or answer a finding of a render, that it stands and why",
    ),
  );
