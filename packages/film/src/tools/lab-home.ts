// The lab's `/`: no page of its own. It sends the owner on to the newest ask
// that still asks (302), and with none says so on one line. A store that
// cannot be read answers 500 with that failure: a failed read is no proof that
// nothing waits.

import { Array as Arr, Effect, Option } from 'effect';
import { HttpServerResponse } from 'effect/http';
import { pageHref } from '../core/api.ts';
import { type AskRecord, askStatus } from '../core/ask.ts';
import { AskStore } from './ask-store.ts';

/** What `/` says when no ask waits on the owner. */
const NOTHING_WAITS = 'Nothing waits on you';

/** A one-line page of `/`. */
const line = (words: string, status: number) =>
  HttpServerResponse.setStatus(
    HttpServerResponse.html(
      `<!doctype html><meta charset="utf-8"><title>Lab</title><p>${words}</p>`,
    ),
    status,
  );

/** `/` for the asks as the store lists them (the newest first). */
const homeAnswer = (
  asks: ReadonlyArray<Pick<AskRecord, 'id' | 'state'>>,
): HttpServerResponse.HttpServerResponse =>
  Option.match(
    Arr.findFirst(asks, (r) => askStatus(r.state) === 'asking'),
    {
      onSome: (r) => HttpServerResponse.redirect(pageHref.ask(r.id)),
      onNone: () => line(NOTHING_WAITS, 200),
    },
  );

/** `/`, read from the store now. */
export const home = Effect.gen(function* () {
  const asks = yield* AskStore;
  return yield* asks.list.pipe(
    Effect.map(homeAnswer),
    Effect.catch((error) =>
      Effect.as(
        Effect.logError(`lab.home.unread error=${error._tag}`),
        line(`The asks could not be read (${error._tag})`, 500),
      ),
    ),
  );
});
