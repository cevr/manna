// What the build asks of the owner. Every entry across the members built
// that is drawn but not kept goes on one ask (`askStage`), made through the
// ask store, the asker's open page joined, each keep choice showing its
// drawing (published as a review set, `DrawingSet`); the build's earlier ask
// about the film is closed as superseded. Its key holds each drawing's
// bytes, so a rerun with the same needs is cached and posts nothing. Every
// entry not drawn is drawn as sheet tries (`drawStage`), only when the
// build's `--spend okra` allows it; its key holds the needs, so a rerun
// draws nothing again. Neither keeps anything: the owner's answer is kept
// with `concept keep … --ask <id>`.

import { Array as Arr, Context, Effect, Option } from 'effect';
import { AskName, type AskRecord, askStatus, askedIn, oneQuestion } from '../../core/ask.ts';
import { AskStore } from '../ask-store.ts';
import type { FilmName } from '../film-repo.ts';
import { type Stage, StageFailed, fileInput } from './graph.ts';
import type { MemberStages } from './stages.ts';

/** The asker the build's asks are made by. */
export const BUILD_ASKER = 'concept build';

/**
 * The drawings an ask shows, published where the lab serves them: `publish`
 * answers each need's image `src`, in order.
 */
export class DrawingSet extends Context.Service<
  DrawingSet,
  {
    readonly publish: (
      film: FilmName,
      needs: ReadonlyArray<OwnerNeed>,
    ) => Effect.Effect<ReadonlyArray<string>, StageFailed>;
  }
>()('@manna/film/tools/cast-build/DrawingSet') {}

/** One entry the owner must draw (`drawn`) or keep (`kept`), with its drawing's path. */
export interface OwnerNeed {
  readonly film: FilmName;
  readonly member: string;
  readonly id: string;
  readonly file: string;
  readonly lacks: 'drawn' | 'kept';
}

const encoder = new TextEncoder();

/** `<member>/<id>`: a need as the build names it. */
export const needName = (need: OwnerNeed) => `${need.member}/${need.id}`;

/** The entries across the members built that the owner must draw, or keep once drawn. */
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

/** A keep choice's question: `<member>/<id>: keep this drawing?`. */
const KEEP_QUESTION = ': keep this drawing?';
const keepLabel = (need: OwnerNeed) => `${needName(need)}${KEEP_QUESTION}`;

/** The members an ask of the build asks about, read from its keep choices' questions (`keepLabel`). */
const membersAsked = (record: AskRecord) =>
  new Set(
    Object.values(record.ask.steps)
      .flatMap(askedIn)
      .filter((b) => b.kind === 'choose' && b.label.endsWith(KEEP_QUESTION))
      .map((b) => b.label.split('/')[0] ?? ''),
  );

/** One choice per drawing: keep it (recommended), shown at `src` with its path beside it, or draw it again. */
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

/** `self` failing as the ask stage fails, in its error's words. */
const asked = <A, E extends { readonly message: string }>(self: Effect.Effect<A, E>) =>
  Effect.mapError(self, (e) => StageFailed.make({ reason: `ask: ${e.message}` }));

/**
 * The build's one ask, about `film`: every need `kept` lacks, its drawings
 * published first (`DrawingSet`) so each keep choice shows its own, made once
 * through the ask store on the asker's open page; then each earlier build ask
 * about the film that still asks, and asks only about `members` (the members
 * this build covers), is closed as superseded: a build of one member never
 * closes another's ask. Its output is the ask's id. Keyed by each drawing's bytes and
 * the needs' names, so the same needs publish and ask once while their ask
 * is not closed; once it is, the same needs ask again (`holds`).
 */
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
    // A need that returns (a drawing changed and changed back) asks again when its ask was closed.
    holds: (output) =>
      Effect.gen(function* () {
        const id = new TextDecoder().decode(output);
        if (id === 'none') return true;
        const all = yield* asked((yield* AskStore).list);
        return all.some((r) => r.id === id && askStatus(r.state) !== 'closed');
      }),
  };
};

/**
 * The build's draws: every need `drawn` lacks, drawn by `draw` (sheet tries
 * on the image route) only when the build's `--spend okra` allows it, else
 * the stage waits. Keyed by the needs' names, so the same needs draw once.
 */
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
