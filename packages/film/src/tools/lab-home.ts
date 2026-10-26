// The lab's `/`: no page of its own. It sends the owner on to the newest ask
// that still asks (302), and with none says so on one line. A store that
// cannot be read answers the same line: the owner has nothing to open.

import { Array as Arr, Effect, Option } from 'effect';
import { HttpServerResponse } from 'effect/http';
import { pageHref } from '../core/api.ts';
import { type AskRecord, askStatus } from '../core/ask.ts';
import { AskStore } from './ask-store.ts';

/** What `/` says when no ask waits on the owner. */
const NOTHING_WAITS = 'Nothing waits on you';

/** `/` for the asks as the store lists them (the newest first). */
const homeAnswer = (
  asks: ReadonlyArray<Pick<AskRecord, 'id' | 'state'>>,
): HttpServerResponse.HttpServerResponse =>
  Option.match(
    Arr.findFirst(asks, (r) => askStatus(r.state) === 'asking'),
    {
      onSome: (r) => HttpServerResponse.redirect(pageHref.ask(r.id)),
      onNone: () =>
        HttpServerResponse.html(
          `<!doctype html><meta charset="utf-8"><title>Lab</title><p>${NOTHING_WAITS}</p>`,
        ),
    },
  );

/** `/`, read from the store now. */
export const home = Effect.gen(function* () {
  const asks = yield* AskStore;
  const listed = yield* asks.list.pipe(
    Effect.catch((error) =>
      Effect.as(Effect.logWarning(`lab.home.unread error=${error._tag}`), []),
    ),
  );
  return homeAnswer(listed);
});
