// `film concept ease <film> <member> --from <pose> --to <pose> --seconds <s>
// [--segment <a>-<b> ...] [--shuffle <seed>]`: one of the member's eases
// (`EASES`, the film's `rigs/cast.ts`) drawn frame by frame in the ease page
// by the real draw path (`ease.ts`), under out/<film>/cast/<member>/ease/<n>/.

import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import { Console, Effect, type Layer, Option, Schema } from 'effect';
import { renderEase } from './ease.ts';
import { filmNamed } from './film-repo.ts';
import type { Pages } from './pages.ts';

/** A segment flag, `<a>-<b>` (frames, both drawn). */
const Segment = Schema.TemplateLiteralParser([Schema.Int, '-', Schema.Int]);

/** `film concept ease`, drawing on `pages` (the app's export pages). */
export const ease = <E, R>(pages: Layer.Layer<Pages, E, R>) =>
  Command.make(
    'ease',
    {
      film: Argument.String('film').pipe(
        Argument.withDescription('the film whose rigs/cast.ts holds the ease'),
      ),
      member: Argument.String('member').pipe(
        Argument.withDescription('the cast member, by its id'),
      ),
      from: Flag.String('from').pipe(Flag.withDescription('the pose it starts from (rest)')),
      to: Flag.String('to').pipe(Flag.withDescription('the pose it ends on (poses-1)')),
      seconds: Flag.Finite('seconds').pipe(Flag.withDescription('its length, s')),
      segment: Flag.String('segment').pipe(
        Flag.atLeast(0),
        Flag.withDescription('frames <a>-<b> drawn in a page of their own (the whole when none)'),
      ),
      shuffle: Flag.Int('shuffle').pipe(
        Flag.optional,
        Flag.withDescription('draw the frames in an order shuffled by this seed, in one page'),
      ),
    },
    Effect.fn('film.concept.ease')(function* (input) {
      const film = yield* filmNamed(input.film);
      const segments = yield* Effect.forEach(input.segment, (s) =>
        Schema.decodeUnknownEffect(Segment)(s),
      );
      const made = yield* renderEase(film, input.member, {
        from: input.from,
        to: input.to,
        seconds: input.seconds,
        segments: segments.map(([a, , b]) => [a, b] as const),
        shuffle: input.shuffle,
      });
      yield* Console.log(
        `ease ${input.member} ${input.from}-${input.to} n=${made.n} frames=${made.record.count} segments=${made.record.segments.length}${Option.match(input.shuffle, { onNone: () => '', onSome: (s) => ` shuffled=${s}` })} ${made.dir}`,
      );
    }),
  ).pipe(
    Command.provide(pages),
    Command.withDescription(
      "Draw a cast member's ease (rigs/cast.ts EASES) frame by frame in its ease page, the real draw path, each frame a PNG with ease.json beside them (out/<film>/cast/<member>/ease/<n>/)",
    ),
  );
