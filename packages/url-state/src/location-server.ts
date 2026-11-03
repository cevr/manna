import { Effect, Layer, Stream } from 'effect';

import { Location, parseHref, relativeHref, type Entry } from './location.js';

const SERVER_ENTRY_KEY = 'server';

export const layerServer = (href: string): Layer.Layer<Location> => {
  const url = parseHref(href);
  url.hash = '';
  const entry: Entry = { href: relativeHref(url), key: SERVER_ENTRY_KEY, navigation: 'load' };
  const ignored = (write: 'push' | 'replace') => (to: string) =>
    Effect.logDebug(`location.server.write.ignored write=${write} href=${to}`);
  return Layer.succeed(
    Location,
    Location.of({
      current: Effect.succeed(entry),
      changes: Stream.make(entry),
      push: ignored('push'),
      replace: ignored('replace'),
      back: Effect.logDebug('location.server.back.ignored'),
    }),
  );
};
