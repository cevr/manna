import { Array as Arr, Context, Effect, Option } from 'effect';
import { AskName, type AskRecord, askStatus, askedIn, oneQuestion } from '../../core/ask.ts';
import { AskStore } from '../ask-store.ts';
import type { FilmName } from '../film-repo.ts';
import { type Stage, StageFailed, fileInput } from './graph.ts';
import type { MemberStages } from './stages.ts';

const BUILD_ASKER = 'concept build';

export class DrawingSet extends Context.Service<
  DrawingSet,
  {
    readonly publish: (
      film: FilmName,
      needs: ReadonlyArray<OwnerNeed>,
    ) => Effect.Effect<ReadonlyArray<string>, StageFailed>;
  }
>()('@manna/film/tools/cast-build/DrawingSet') {}

export interface OwnerNeed {
  readonly film: FilmName;
  readonly member: string;
  readonly id: string;
  readonly file: string;
  readonly lacks: 'drawn' | 'kept';
}

const encoder = new TextEncoder();

export const needName = (need: OwnerNeed) => `${need.member}/${need.id}`;

export const ownerNeeds = (
  members: ReadonlyArray<
    Pick<MemberStages, 'film' | 'member' | 'memberDir' | 'coverage' | 'facts'>
  >,
): ReadonlyArray<OwnerNeed> =>
  members.flatMap((m) =>
    m.coverage.entries.flatMap((e): ReadonlyArray<OwnerNeed> => {
      const facts = Option.fromNullishOr(m.facts[e.id]);
      const file = `${m.memberDir}/${e.file}`;
      const at = { film: m.film, member: m.member, id: e.id, file };
      if (!Option.exists(facts, (f) => f.drawn)) return [{ ...at, lacks: 'drawn' }];
      if (!Option.exists(facts, (f) => f.kept)) return [{ ...at, lacks: 'kept' }];
      return [];
    }),
  );

const KEEP_QUESTION = ': keep this drawing?';
const keepLabel = (need: OwnerNeed) => `${needName(need)}${KEEP_QUESTION}`;

const membersAsked = (record: AskRecord) =>
  new Set(
    Object.values(record.ask.steps)
      .flatMap(askedIn)
      .filter((b) => b.kind === 'choose' && b.label.endsWith(KEEP_QUESTION))
      .map((b) => b.label.split('/')[0] ?? ''),
  );

const keepChoice = (need: OwnerNeed, n: number, src: string) => ({
  kind: 'choose' as const,
  id: AskName.make(`keep-${n + 1}`),
  label: keepLabel(need),
  options: [
    {
      value: 'keep',
      label: 'Keep it',
      recommended: true,
      why: 'It is drawn; once kept, the build cuts it, fits it and trains on it.',
      image: { src, caption: need.file },
      outcome: 'keep' as const,
      keeps: { film: need.film, scenes: [] },
    },
    { value: 'redraw', label: 'Draw it again', outcome: 'revise' as const },
  ],
});

const asked = <A, E extends { readonly message: string }>(self: Effect.Effect<A, E>) =>
  Effect.mapError(self, (e) => StageFailed.make({ reason: `ask: ${e.message}` }));

export const askStage = (
  film: FilmName,
  members: ReadonlyArray<string>,
  needs: ReadonlyArray<OwnerNeed>,
): Stage<AskStore | DrawingSet> => {
  const keeps = needs.filter((n) => n.lacks === 'kept');
  return {
    id: 'ask',
    inputs: keeps.map((n) => fileInput(n.file)),
    version: '3',
    config: keeps.map(needName).join('\n'),
    run: () => {
      if (keeps.length === 0) return Effect.succeed(encoder.encode('none'));
      return Effect.gen(function* () {
        const asks = yield* AskStore;
        const srcs = yield* (yield* DrawingSet).publish(film, keeps);
        if (srcs.length !== keeps.length)
          return yield* StageFailed.make({
            reason: `ask: ${keeps.length} drawings published as ${srcs.length}`,
          });
        const made = yield* asked(
          asks.make({
            title: `Keep the cast drawings the build waits on (${keeps.length})`,
            why: `The cast build cuts, fits and trains only on kept drawings. Drawn and not kept: ${keeps.map(needName).join(', ')}.`,
            by: BUILD_ASKER,
            film,
            ask: oneQuestion(
              Arr.zip(keeps, srcs).map(([need, src], n) => keepChoice(need, n, src)),
              'Kept answers go in with concept keep.',
            ),
          }),
        );
        const earlier = (yield* asked(asks.list)).filter(
          (r) =>
            r.id !== made.id &&
            r.by === BUILD_ASKER &&
            r.film === film &&
            askStatus(r.state) === 'asking' &&
            [...membersAsked(r)].every((who) => members.includes(who)),
        );
        yield* Effect.forEach(earlier, (r) => asked(asks.close(r.id, `superseded by ${made.id}`)), {
          discard: true,
        });
        return encoder.encode(made.id);
      });
    },
    holds: (output) =>
      Effect.gen(function* () {
        const id = new TextDecoder().decode(output);
        if (id === 'none') return true;
        const all = yield* asked((yield* AskStore).list);
        return all.some((r) => r.id === id && askStatus(r.state) !== 'closed');
      }),
  };
};

export const drawStage = <R>(
  needs: ReadonlyArray<OwnerNeed>,
  draw: (needs: ReadonlyArray<OwnerNeed>) => Effect.Effect<unknown, StageFailed, R>,
): Stage<R> => {
  const draws = needs.filter((n) => n.lacks === 'drawn');
  return {
    id: 'draw',
    inputs: [],
    version: '1',
    config: draws.map(needName).join('\n'),
    run: (ctx) => {
      if (draws.length === 0) return Effect.succeed(encoder.encode('none'));
      return ctx
        .spend('okra', draw(draws))
        .pipe(Effect.as(encoder.encode(`drew ${draws.map(needName).join(', ')}`)));
    },
  };
};
