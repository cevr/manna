import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type * as Atom from 'effect/reactivity/Atom';
import { Schema } from 'effect';

import { useAtomRefresh, useAtomValue } from '../../src/hooks.ts';

/** The answer's place in the page's serialized data. */
export const ANSWER_KEY = 'answer';

/** The answer as the server sends it: a string, or the read's failure as a defect. */
export const AnswerResult = AsyncResult.Schema({ success: Schema.String });

/** The read the page shows: the server's own read on the server, the browser's request in the client. */
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
