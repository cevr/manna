import { Array as Arr, Duration, Effect, Option } from 'effect';

import {
  DEFAULT_LIMIT,
  EXAMPLE_QUERIES,
  NO_SELECTION,
  PAGE_CONTEXT,
  type SearchRequest,
} from '../api.js';
import { runSearchBatch } from '../search.js';

export const WARM_SCHEDULE = '* * * * *';

export const warmRequest = (scheduledTime: number): SearchRequest => {
  const minute = Math.floor(scheduledTime / Duration.toMillis(Duration.minutes(1)));
  const q = Option.getOrElse(Arr.get(EXAMPLE_QUERIES, minute % EXAMPLE_QUERIES.length), () =>
    Arr.headNonEmpty(EXAMPLE_QUERIES),
  );
  return {
    q,
    scope: 'all',
    section: NO_SELECTION,
    type: NO_SELECTION,
    subtype: NO_SELECTION,
    excludeApparatus: false,
    limit: DEFAULT_LIMIT,
    context: PAGE_CONTEXT,
  };
};

export const warmSearch = Effect.fn('Search.warm')(function* (scheduledTime: number) {
  const request = warmRequest(scheduledTime);
  const [elapsed, slots] = yield* Effect.timed(runSearchBatch([request]));
  const failure = Option.fromNullishOr(slots.find((slot) => slot._tag === 'Failed')).pipe(
    Option.map((slot) => slot.message),
  );
  yield* Effect.logInfo('search.warm').pipe(
    Effect.annotateLogs({
      q: request.q,
      ms: Math.round(Duration.toMillis(elapsed)),
      failed: Option.getOrElse(failure, () => 'no'),
    }),
  );
});
