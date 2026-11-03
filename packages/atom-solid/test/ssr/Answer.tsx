import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type * as Atom from 'effect/reactivity/Atom';
import { Schema } from 'effect';

import { useAtomRefresh, useAtomValue } from '../../src/hooks.ts';

export const ANSWER_KEY = 'answer';

export const AnswerResult = AsyncResult.Schema({ success: Schema.String });

export type AnswerAtom = Atom.Atom<AsyncResult.AsyncResult<string>>;

export const Answer = (props: { readonly answer: AnswerAtom }) => {
  const answer = useAtomValue(() => props.answer);
  const again = useAtomRefresh(() => props.answer);
  return (
    <main>
      <button id="again" type="button" onClick={again}>
        Read again
      </button>
      <p id="answer">
        {AsyncResult.match(answer(), {
          onInitial: () => 'reading',
          onSuccess: (s) => `answered ${s.value}`,
          onFailure: () => 'failed',
        })}
      </p>
    </main>
  );
};
