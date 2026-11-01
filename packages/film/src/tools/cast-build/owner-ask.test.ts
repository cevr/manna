// The build's asks of the owner, over the lab's ask store in memory: the kept
// needs go on one ask, each keep choice showing its drawing (published as a
// set, copied as the ask is made); a rerun with the same needs publishes and
// asks nothing; a changed drawing asks again and closes the earlier ask, so
// one stays open; and the drawn needs are drawn only under --spend okra.

import { describe, expect, it } from 'effect-bun-test';
import { Boolean as Bool, Effect, Layer, Option } from 'effect';
import { type AskRecord, askStatus, askedIn } from '../../core/ask.ts';
import { reviewFileUrl } from '../../core/api.ts';
import { ReviewFileUnknown } from '../../core/refusals.ts';
import { AskStore } from '../ask-store.ts';
import type { FilmName } from '../film-repo.ts';
import { echoPages, noRenders, noStudio } from '../film-services/testing.ts';
import { text } from '../host/testing.ts';
import { labInMemory } from '../lab/testing.ts';
import { Review } from '../review.ts';
import { type BuildOptions, buildGraph } from './graph.ts';
import {
  BUILD_ASKER,
  DrawingSet,
  type OwnerNeed,
  askStage,
  drawStage,
  ownerNeeds,
} from './owner-ask.ts';

const options = (over: Partial<BuildOptions> = {}): BuildOptions => ({
  cache: '/cache',
  plan: false,
  touch: [],
  spend: new Set(),
  ...over,
});

const film = 'in-its-order' as FilmName;

type Member = Parameters<typeof ownerNeeds>[0][number];

/** lead-feast: front drawn and kept, side and back drawn and not kept, k2 not drawn. */
const member = {
  film,
  member: 'lead-feast',
  memberDir: '/m/lead-feast',
  coverage: {
    member: 'lead-feast',
    entries: [
      { id: 'turnaround-front', cut: 'puppet', file: 'views/front.png' },
      { id: 'turnaround-side', cut: 'puppet', file: 'views/side.png' },
      { id: 'turnaround-back', cut: 'puppet', file: 'views/back.png' },
      { id: 'raise/k2', cut: 'key', file: 'raise/k2.png' },
    ],
  },
  facts: {
    'turnaround-front': { drawn: true, kept: true, cut: true, bars: true, fit: true },
    'turnaround-side': { drawn: true, kept: false, cut: false, bars: false, fit: false },
    'turnaround-back': { drawn: true, kept: false, cut: false, bars: false, fit: false },
  },
} as unknown as Member;

/** wife: her front drawn and not kept. */
const wife = {
  film,
  member: 'wife',
  memberDir: '/m/wife',
  coverage: {
    member: 'wife',
    entries: [{ id: 'turnaround-front', cut: 'puppet', file: 'views/front.png' }],
  },
  facts: {
    'turnaround-front': { drawn: true, kept: false, cut: false, bars: false, fit: false },
  },
} as unknown as Member;
const WIFE_FRONT = '/m/wife/views/front.png';

const SIDE = '/m/lead-feast/views/side.png';
const BACK = '/m/lead-feast/views/back.png';

/** The film's folder, and the two drawings not kept. */
const filesOf = () =>
  new Map<string, Uint8Array>([
    [`/films/${film}/scenes/index.ts`, text('export {};\n')],
    [SIDE, text('side v1')],
    [BACK, text('back v1')],
    [WIFE_FRONT, text('wife front v1')],
  ]);

/** Where the set below puts a need's drawing, as the review names it. */
const refOf = (need: OwnerNeed) => `cast-keep/${need.member}/${need.id}.png`;

/**
 * The lab in memory over `files`, its review serving what the set below
 * published under `/out`, and a set that copies each drawing there and
 * answers its review route, each publish recorded in `published`.
 */
const labOver = (files: Map<string, Uint8Array>, published: Array<ReadonlyArray<string>>) => {
  const review = Layer.effect(
    Review,
    Effect.map(Effect.service(Review), (none) =>
      Review.of({
        ...none,
        resolve: (ref) =>
          Bool.match(files.has(`/out/${ref}`), {
            onTrue: () => Effect.succeed(`/out/${ref}`),
            onFalse: () => Effect.fail(ReviewFileUnknown.make({ ref })),
          }),
      }),
    ),
  ).pipe(Layer.provide(noRenders));
  const set = Layer.succeed(
    DrawingSet,
    DrawingSet.of({
      publish: (_film, needs) =>
        Effect.sync(() => {
          for (const need of needs)
            Option.map(Option.fromUndefinedOr(files.get(need.file)), (bytes) =>
              files.set(`/out/${refOf(need)}`, bytes),
            );
          published.push(needs.map(refOf));
          return needs.map((need) => reviewFileUrl(refOf(need)));
        }),
    }),
  );
  return Layer.merge(
    labInMemory(files, echoPages, { asking: Layer.mergeAll(review, noStudio) }),
    set,
  );
};

/** The build's asks about the film that still ask. */
const openAsks = Effect.map(
  Effect.flatMap(Effect.service(AskStore), (asks) => asks.list),
  (all) =>
    all.filter((r) => r.by === BUILD_ASKER && r.film === film && askStatus(r.state) === 'asking'),
);

/** Each keep choice of `record`: its label, and its keep option's image. */
const keepChoices = (record: AskRecord) =>
  Object.values(record.ask.steps)
    .flatMap(askedIn)
    .filter((b) => b.kind === 'choose')
    .map((b) => ({
      label: b.label,
      image: b.options.find((o) => o.value === 'keep')?.image,
    }));

/** The bytes ask `id` shows at `src` (its copy's route), as the lab serves them. */
const shownBytes = (id: string, src: string) =>
  Effect.flatMap(Effect.service(AskStore), (asks) =>
    Effect.map(asks.shownFile(id, decodeURIComponent(src.split('/').pop() ?? '')), (shown) =>
      new TextDecoder().decode(shown.bytes),
    ),
  );

/** The one ask of `asks`; a defect when there is none. */
const only = (asks: ReadonlyArray<AskRecord>) =>
  Effect.fromOption(Option.fromUndefinedOr(asks[0])).pipe(Effect.orDie);

const statesOf = (report: { stages: ReadonlyArray<{ id: string; state: string }> }) =>
  Object.fromEntries(report.stages.map((s) => [s.id, s.state]));

describe('the build asks the owner once', () => {
  it.effect('names each entry not drawn, and each drawn and not kept', () =>
    Effect.sync(() =>
      expect(ownerNeeds([member]).map((n) => [n.id, n.lacks, n.file])).toEqual([
        ['turnaround-side', 'kept', SIDE],
        ['turnaround-back', 'kept', BACK],
        ['raise/k2', 'drawn', '/m/lead-feast/raise/k2.png'],
      ]),
    ),
  );

  it.effect('each keep choice shows its drawing, and a rerun publishes and asks nothing', () => {
    const files = filesOf();
    const published: Array<ReadonlyArray<string>> = [];
    const drew: Array<ReadonlyArray<OwnerNeed>> = [];
    const needs = ownerNeeds([member]);
    const stages = [
      askStage(film, ['lead-feast'], needs),
      drawStage(needs, (draws) => Effect.sync(() => void drew.push(draws))),
    ];
    return Effect.gen(function* () {
      const first = yield* buildGraph(stages, options());
      expect(statesOf(first)).toEqual({ ask: 'ran', draw: 'waiting-spend' });
      const open = yield* openAsks;
      expect(open).toHaveLength(1);
      const ask = yield* only(open);
      const choices = keepChoices(ask);
      expect(choices.map((c) => [c.label, c.image?.caption])).toEqual([
        ['lead-feast/turnaround-side: keep this drawing?', SIDE],
        ['lead-feast/turnaround-back: keep this drawing?', BACK],
      ]);
      // Each shows its own drawing, copied as the ask was made.
      const shown = yield* Effect.forEach(choices, (c) =>
        shownBytes(ask.id, c.image?.src ?? '/nonexistent/loop-probe-x'),
      );
      expect(shown).toEqual(['side v1', 'back v1']);
      expect(drew).toHaveLength(0);
      expect(first.okraCalls).toBe(0);

      const second = yield* buildGraph(stages, options());
      expect(statesOf(second)).toEqual({ ask: 'cached', draw: 'waiting-spend' });
      expect(published).toHaveLength(1);
      expect((yield* openAsks).map((r) => r.id)).toEqual([ask.id]);
    }).pipe(Effect.provide(labOver(files, published)));
  });

  it.effect('a changed drawing asks again and closes the earlier ask: one stays open', () => {
    const files = filesOf();
    const stages = [askStage(film, ['lead-feast'], ownerNeeds([member]))];
    return Effect.gen(function* () {
      yield* buildGraph(stages, options());
      const earlier = yield* only(yield* openAsks);

      files.set(SIDE, text('side v2'));
      yield* buildGraph(stages, options());
      const open = yield* openAsks;
      expect(open).toHaveLength(1);
      const current = yield* only(open);
      expect(current.id).not.toBe(earlier.id);
      const side = keepChoices(current)[0]?.image?.src ?? '/nonexistent/loop-probe-x';
      expect(yield* shownBytes(current.id, side)).toBe('side v2');
      const closed = yield* Effect.flatMap(Effect.service(AskStore), (asks) =>
        asks.read(earlier.id),
      );
      expect(closed.state).toMatchObject({ _tag: 'Closed', why: `superseded by ${current.id}` });
      // The earlier ask still shows the drawing it asked about.
      const before = keepChoices(earlier)[0]?.image?.src ?? '/nonexistent/loop-probe-x';
      expect(yield* shownBytes(earlier.id, before)).toBe('side v1');
    }).pipe(Effect.provide(labOver(files, [])));
  });

  it.effect(
    'a drawing changed and changed back asks again: its closed ask is not its answer',
    () => {
      const files = filesOf();
      const stages = [askStage(film, ['lead-feast'], ownerNeeds([member]))];
      return Effect.gen(function* () {
        yield* buildGraph(stages, options());
        const first = yield* only(yield* openAsks);
        files.set(SIDE, text('side v2'));
        yield* buildGraph(stages, options());
        const second = yield* only(yield* openAsks);

        files.set(SIDE, text('side v1'));
        expect(statesOf(yield* buildGraph(stages, options()))).toEqual({ ask: 'ran' });
        const open = yield* openAsks;
        expect(open).toHaveLength(1);
        const current = yield* only(open);
        expect([first.id, second.id]).not.toContain(current.id);
        const side = keepChoices(current)[0]?.image?.src ?? '/nonexistent/loop-probe-x';
        expect(yield* shownBytes(current.id, side)).toBe('side v1');
        // A rerun keeps the ask it made.
        expect(statesOf(yield* buildGraph(stages, options()))).toEqual({ ask: 'cached' });
        expect((yield* openAsks).map((r) => r.id)).toEqual([current.id]);
      }).pipe(Effect.provide(labOver(files, [])));
    },
  );

  it.effect(
    'a build closes only its own members’ asks: lead, wife, lead leaves each one open',
    () => {
      const files = filesOf();
      const lead = [askStage(film, ['lead-feast'], ownerNeeds([member]))];
      const her = [askStage(film, ['wife'], ownerNeeds([wife]))];
      /** The open asks with a keep choice about `who`. */
      const openAbout = (who: string) =>
        Effect.map(openAsks, (open) =>
          open.filter((r) => keepChoices(r).some((c) => c.label.startsWith(`${who}/`))),
        );
      return Effect.gen(function* () {
        yield* buildGraph(lead, options());
        yield* buildGraph(her, options());
        const again = yield* buildGraph(lead, options());
        expect(statesOf(again)).toEqual({ ask: 'cached' });
        expect(yield* openAbout('lead-feast')).toHaveLength(1);
        expect(yield* openAbout('wife')).toHaveLength(1);
        expect(yield* openAsks).toHaveLength(2);
        // A build of both asks about both, and closes each one's earlier ask.
        yield* buildGraph(
          [askStage(film, ['lead-feast', 'wife'], ownerNeeds([member, wife]))],
          options(),
        );
        const open = yield* openAsks;
        expect(open).toHaveLength(1);
        expect(keepChoices(yield* only(open)).map((c) => c.label.split(':')[0])).toEqual([
          'lead-feast/turnaround-side',
          'lead-feast/turnaround-back',
          'wife/turnaround-front',
        ]);
      }).pipe(Effect.provide(labOver(files, [])));
    },
  );

  it.effect('the drawn needs are drawn once under --spend okra', () => {
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
    }).pipe(Effect.provide(labOver(filesOf(), [])));
  });

  it.effect('no kept need: no ask is made', () => {
    const published: Array<ReadonlyArray<string>> = [];
    return Effect.gen(function* () {
      const report = yield* buildGraph([askStage(film, ['lead-feast'], [])], options());
      expect(statesOf(report)).toEqual({ ask: 'ran' });
      expect(yield* openAsks).toHaveLength(0);
      expect(published).toHaveLength(0);
    }).pipe(Effect.provide(labOver(filesOf(), published)));
  });
});
