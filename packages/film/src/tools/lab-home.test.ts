import { describe, expect, test } from 'bun:test';
import { AskName, AskState } from '../core/ask.ts';
import { NOTHING_WAITS, homeAnswer } from './lab-home.ts';

const asking = (id: string) => ({
  id: AskName.make(id),
  state: AskState.Asking({ step: AskName.make('pick'), answers: {} }),
});
const answered = (id: string) => ({
  id: AskName.make(id),
  state: AskState.Answered({ step: AskName.make('pick'), answers: {} }),
});
const closed = (id: string) => ({
  id: AskName.make(id),
  state: AskState.Closed({ answers: {}, why: 'acted on' }),
});

describe("the lab's home", () => {
  test('sends the owner on to the newest ask that still asks', () => {
    const answer = homeAnswer([answered('a3'), asking('a2'), asking('a1')]);
    expect(answer.status).toBe(302);
    expect(answer.headers['location']).toBe('/asks/a2');
  });

  test('with no ask asking, says nothing waits, on a page of its own', () => {
    for (const asks of [[], [answered('a2'), closed('a1')]]) {
      const answer = homeAnswer(asks);
      expect(answer.status).toBe(200);
      expect(answer.headers['location']).toBeUndefined();
      expect(answer.body._tag).toBe('Uint8Array');
      if (answer.body._tag === 'Uint8Array')
        expect(new TextDecoder().decode(answer.body.body)).toContain(`<p>${NOTHING_WAITS}</p>`);
    }
  });
});
