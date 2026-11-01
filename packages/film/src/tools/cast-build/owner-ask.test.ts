// The build's asks of the owner over an ask store that records each make: the
// kept needs go on one ask, a rerun with the same needs makes none, a changed
// drawing asks again, and the drawn needs are drawn only under --spend okra.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Path } from 'effect';
import { type Ask, AskName, askStart, askedIn } from '../../core/ask.ts';
import { AskStore } from '../ask-store.ts';
import { ContentStore } from '../content-store.ts';
import type { FilmName } from '../film-repo.ts';
import { memoryFileSystem, memoryLocks, text } from '../host/testing.ts';
import { type BuildOptions, buildGraph } from './graph.ts';
import { BUILD_ASKER, type OwnerNeed, askStage, drawStage, ownerNeeds } from './owner-ask.ts';

const options = (over: Partial<BuildOptions> = {}): BuildOptions => ({
  cache: '/cache',
  plan: false,
  touch: [],
  spend: new Set(),
  ...over,
});

const film = 'in-its-order' as FilmName;

/** lead-feast: front drawn and kept, side drawn and not kept, k2 not drawn. */
const member = {
  film,
  member: 'lead-feast',
  memberDir: '/m/lead-feast',
  coverage: {
    member: 'lead-feast',
    entries: [
      { id: 'turnaround-front', cut: 'puppet', file: 'views/front.png' },
      { id: 'turnaround-side', cut: 'puppet', file: 'views/side.png' },
      { id: 'raise/k2', cut: 'key', file: 'raise/k2.png' },
    ],
  },
  facts: {
    'turnaround-front': { drawn: true, kept: true, cut: true, bars: true, fit: true },
    'turnaround-side': { drawn: true, kept: false, cut: false, bars: false, fit: false },
  },
} as unknown as Parameters<typeof ownerNeeds>[0][number];

/** A store whose `make` records each draft's asker and ask, and answers a fresh id. */
const recordingAsks = (made: Array<{ by: string; ask: Ask }>) =>
  Layer.mock(AskStore)({
    dir: '/nonexistent/asks',
    file: (id) => `/nonexistent/asks/${id}`,
    make: (draft) =>
      Effect.sync(() => {
        made.push({ by: draft.by, ask: draft.ask });
        const id = AskName.make(`a${String(made.length).padStart(10, '0')}`);
        return {
          id,
          title: draft.title,
          why: draft.why,
          by: draft.by,
          created: '2026-11-01T00:00:00Z',
          ask: draft.ask,
          state: askStart(draft.ask),
          answered: [],
        };
      }),
  });

const servicesOver = (files: Map<string, Uint8Array>, made: Array<{ by: string; ask: Ask }>) =>
  Layer.mergeAll(
    ContentStore.layer.pipe(Layer.provideMerge([memoryFileSystem(files), Path.layer, memoryLocks])),
    recordingAsks(made),
  );

const statesOf = (report: { stages: ReadonlyArray<{ id: string; state: string }> }) =>
  Object.fromEntries(report.stages.map((s) => [s.id, s.state]));

describe('the build asks the owner once', () => {
  it.effect('names each entry not drawn, and each drawn and not kept', () =>
    Effect.sync(() =>
      expect(ownerNeeds([member]).map((n) => [n.id, n.lacks, n.file])).toEqual([
        ['turnaround-side', 'kept', '/m/lead-feast/views/side.png'],
        ['raise/k2', 'drawn', '/m/lead-feast/raise/k2.png'],
      ]),
    ),
  );

  it.effect(
    'one ask for the kept needs, none again on a rerun, and no draw without --spend okra',
    () => {
      const files = new Map([['/m/lead-feast/views/side.png', text('side v1')]]);
      const made: Array<{ by: string; ask: Ask }> = [];
      const drew: Array<ReadonlyArray<OwnerNeed>> = [];
      const needs = ownerNeeds([member]);
      const stages = [
        askStage(film, needs),
        drawStage(needs, (draws) => Effect.sync(() => void drew.push(draws))),
      ];
      return Effect.gen(function* () {
        const first = yield* buildGraph(stages, options());
        expect(statesOf(first)).toEqual({ ask: 'ran', draw: 'waiting-spend' });
        expect(made).toHaveLength(1);
        expect(made[0]?.by).toBe(BUILD_ASKER);
        const asked = Object.values(made[0]?.ask.steps ?? {}).flatMap(askedIn);
        expect(asked.map((b) => b.label)).toEqual([
          'lead-feast/turnaround-side: keep this drawing? (/m/lead-feast/views/side.png)',
        ]);
        expect(drew).toHaveLength(0);
        expect(first.okraCalls).toBe(0);

        const second = yield* buildGraph(stages, options());
        expect(statesOf(second)).toEqual({ ask: 'cached', draw: 'waiting-spend' });
        expect(made).toHaveLength(1);

        // the drawing redrawn: its bytes are a new need, asked again
        files.set('/m/lead-feast/views/side.png', text('side v2'));
        yield* buildGraph(stages, options());
        expect(made).toHaveLength(2);
      }).pipe(Effect.provide(servicesOver(files, made)));
    },
  );

  it.effect('the drawn needs are drawn once under --spend okra', () => {
    const files = new Map([['/m/lead-feast/views/side.png', text('side v1')]]);
    const made: Array<{ by: string; ask: Ask }> = [];
    const drew: Array<ReadonlyArray<OwnerNeed>> = [];
    const needs = ownerNeeds([member]);
    const stages = [drawStage(needs, (draws) => Effect.sync(() => void drew.push(draws)))];
    const okra = options({ spend: new Set(['okra'] as const) });
    return Effect.gen(function* () {
      const first = yield* buildGraph(stages, okra);
      expect(statesOf(first)).toEqual({ draw: 'ran' });
      expect(drew.map((d) => d.map((n) => n.id))).toEqual([['raise/k2']]);
      yield* buildGraph(stages, okra);
      expect(drew).toHaveLength(1);
    }).pipe(Effect.provide(servicesOver(files, made)));
  });

  it.effect('no kept need: no ask is made', () => {
    const made: Array<{ by: string; ask: Ask }> = [];
    return Effect.gen(function* () {
      const report = yield* buildGraph([askStage(film, [])], options());
      expect(statesOf(report)).toEqual({ ask: 'ran' });
      expect(made).toHaveLength(0);
    }).pipe(Effect.provide(servicesOver(new Map(), made)));
  });
});
