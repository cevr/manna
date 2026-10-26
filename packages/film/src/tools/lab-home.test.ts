import { Effect, Layer, Schema } from 'effect';
import type { HttpServerResponse } from 'effect/http';
import { describe, expect, it } from 'effect-bun-test';
import { AskName, AskRecord, AskState } from '../core/ask.ts';
import { AskStore } from './ask-store.ts';
import { FileInvalid } from './errors.ts';
import { home } from './lab-home.ts';

/** An ask `id` in `state`, decoded as the store decodes it. */
const ask = (id: string, state: AskState): AskRecord => ({
  ...Schema.decodeSync(AskRecord)({
    id,
    title: 'Keep a try',
    why: 'the beat waits on it',
    by: 'labmcp',
    created: '2026-10-14T00:00:00.000Z',
    ask: { start: 'done', steps: { done: { end: true } } },
    state: AskState.Asking({ step: AskName.make('done'), answers: {} }),
    answered: [],
  }),
  state,
});
const asking = (id: string) =>
  ask(id, AskState.Asking({ step: AskName.make('pick'), answers: {} }));
const answered = (id: string) =>
  ask(id, AskState.Answered({ step: AskName.make('pick'), answers: {} }));
const closed = (id: string) => ask(id, AskState.Closed({ answers: {}, why: 'acted on' }));

/** `/` over a store whose list answers `list`. */
const homeOver = (list: AskStore['Service']['list']) =>
  home.pipe(
    Effect.provide(
      Layer.mock(AskStore)({
        dir: '/nonexistent/asks',
        file: (id) => `/nonexistent/asks/${id}`,
        list,
      }),
    ),
  );

/** The words of an answer's body. */
const words = (answer: HttpServerResponse.HttpServerResponse) => {
  expect(answer.body._tag).toBe('Uint8Array');
  if (answer.body._tag !== 'Uint8Array') return '';
  return new TextDecoder().decode(answer.body.body);
};

describe("the lab's home", () => {
  it.effect('sends the owner on to the newest ask that still asks', () =>
    Effect.gen(function* () {
      const answer = yield* homeOver(Effect.succeed([answered('a3'), asking('a2'), asking('a1')]));
      expect(answer.status).toBe(302);
      expect(answer.headers['location']).toBe('/asks/a2');
    }),
  );

  it.effect('with no ask asking, says nothing waits, on a page of its own', () =>
    Effect.gen(function* () {
      for (const asks of [[], [answered('a2'), closed('a1')]]) {
        const answer = yield* homeOver(Effect.succeed(asks));
        expect(answer.status).toBe(200);
        expect(answer.headers['location']).toBeUndefined();
        expect(words(answer)).toContain('<p>Nothing waits on you</p>');
      }
    }),
  );

  it.effect('with a store it cannot read, says nothing waits', () =>
    Effect.gen(function* () {
      const answer = yield* homeOver(
        Effect.fail(FileInvalid.make({ file: '/nonexistent/asks', reason: 'unreadable' })),
      );
      expect(answer.status).toBe(200);
      expect(words(answer)).toContain('<p>Nothing waits on you</p>');
    }),
  );
});
