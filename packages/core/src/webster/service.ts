import { Context, Effect, Layer } from 'effect';

import { WebsterError, type WebsterEntry, type WebsterLookup } from './model.js';
import { normalizeHeadword } from './source.js';

interface WebsterApi {
  readonly lookup: (query: string) => Effect.Effect<WebsterLookup, WebsterError>;
  readonly search: (
    query: string,
    limit?: number,
  ) => Effect.Effect<readonly WebsterEntry[], WebsterError>;
}

const candidates = (key: string): readonly string[] => {
  if (!key.endsWith('eth') && !key.endsWith('est')) return [];
  const bare = key.slice(0, -3);
  const result = [key.slice(0, -2), bare];
  if (/([bcdfghjklmnpqrstvwxyz])\1$/u.test(bare)) result.push(bare.slice(0, -1));
  return [...new Set(result.filter((candidate) => candidate.length > 0))];
};

/** Tokens are reader text. Quoted FTS operators cannot enter the grammar. */
export const searchTerms = (query: string): readonly string[] =>
  query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

export const validateLimit = (limit: number): Effect.Effect<number, WebsterError> => {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    return Effect.fail(
      WebsterError.make({
        operation: 'search',
        message: 'Search limit must be an integer from 1 to 100.',
      }),
    );
  return Effect.succeed(limit);
};

export const makeWebsterApi = (
  byKey: (key: string) => Effect.Effect<readonly WebsterEntry[], WebsterError>,
  search: WebsterApi['search'],
): WebsterApi => ({
  lookup: Effect.fn('WebsterService.lookup')(function* (query) {
    const key = normalizeHeadword(query);
    const exact = yield* byKey(key);
    if (exact.length > 0) return { query, entries: exact, match: 'exact', key };
    for (const candidate of candidates(key)) {
      const entries = yield* byKey(candidate);
      if (entries.length > 0) return { query, entries, match: 'kjv-inflection', key: candidate };
    }
    return { query, entries: [], match: 'none', key };
  }),
  search,
});

export class WebsterService extends Context.Service<WebsterService, WebsterApi>()(
  '@manna/core/webster/WebsterService',
) {
  static Test = (input: {
    readonly entries: readonly WebsterEntry[];
  }): Layer.Layer<WebsterService> => {
    const entries = [...input.entries].sort((a, b) => a.id - b.id);
    return Layer.succeed(
      WebsterService,
      WebsterService.of(
        makeWebsterApi(
          (key) =>
            Effect.succeed(entries.filter((entry) => normalizeHeadword(entry.headword) === key)),
          Effect.fn('WebsterService.searchTest')(function* (query, limit = 20) {
            yield* validateLimit(limit);
            const terms = searchTerms(query);
            if (terms.length === 0) return [];
            return entries
              .filter((entry) => {
                const tokens = new Set(searchTerms(entry.definition));
                return terms.every((term) => tokens.has(term));
              })
              .slice(0, limit);
          }),
        ),
      ),
    );
  };
}
