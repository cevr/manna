// What the build asks of the owner. Every entry across the members built
// that is drawn but not kept goes on one ask (`askStage`), made through the
// ask store, the asker's open page joined; its key holds each drawing's
// bytes, so a rerun with the same needs is cached and posts nothing. Every
// entry not drawn is drawn as sheet tries (`drawStage`), only when the
// build's `--spend okra` allows it; its key holds the needs, so a rerun
// draws nothing again. Neither keeps anything: the owner's answer is kept
// with `concept keep … --ask <id>`.

import { Effect, Option } from 'effect';
import { AskName, oneQuestion } from '../../core/ask.ts';
import { AskStore } from '../ask-store.ts';
import type { FilmName } from '../film-repo.ts';
import { type Stage, StageFailed, fileInput } from './graph.ts';
import type { MemberStages } from './stages.ts';

/** The asker the build's asks are made by. */
export const BUILD_ASKER = 'concept build';

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

/** One choice per drawing: keep it (recommended), or draw it again. */
const keepChoice = (need: OwnerNeed, n: number) => ({
  kind: 'choose' as const,
  id: AskName.make(`keep-${n + 1}`),
  label: `${needName(need)}: keep this drawing? (${need.file})`,
  options: [
    {
      value: 'keep',
      label: 'Keep it',
      recommended: true,
      why: 'It is drawn; once kept, the build cuts it, fits it and trains on it.',
      outcome: 'keep' as const,
      keeps: { film: need.film, scenes: [] },
    },
    { value: 'redraw', label: 'Draw it again', outcome: 'revise' as const },
  ],
});

/**
 * The build's one ask, about `film`: every need `kept` lacks, made once through the ask
 * store on the asker's open page; its output is the ask's id. Keyed by each
 * drawing's bytes and the needs' names, so the same needs ask once.
 */
export const askStage = (film: FilmName, needs: ReadonlyArray<OwnerNeed>): Stage<AskStore> => {
  const keeps = needs.filter((n) => n.lacks === 'kept');
  return {
    id: 'ask',
    inputs: keeps.map((n) => fileInput(n.file)),
    version: '2',
    config: keeps.map(needName).join('\n'),
    run: () => {
      if (keeps.length === 0) return Effect.succeed(encoder.encode('none'));
      return Effect.gen(function* () {
        const asks = yield* AskStore;
        const made = yield* asks.make({
          title: `Keep the cast drawings the build waits on (${keeps.length})`,
          why: `The cast build cuts, fits and trains only on kept drawings. Drawn and not kept: ${keeps.map(needName).join(', ')}.`,
          by: BUILD_ASKER,
          film,
          ask: oneQuestion(keeps.map(keepChoice), 'Kept answers go in with concept keep.'),
        });
        return encoder.encode(made.id);
      }).pipe(Effect.mapError((e) => StageFailed.make({ reason: `ask: ${e.message}` })));
    },
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
