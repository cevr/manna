import { Context, Schema } from 'effect';
import type { Effect, Stream } from 'effect';

const Navigation = Schema.Literals(['load', 'push', 'replace', 'traverse']);

export const Entry = Schema.Struct({
  href: Schema.String,
  key: Schema.String,
  navigation: Navigation,
});
export type Entry = typeof Entry.Type;

interface LocationService {
  readonly current: Effect.Effect<Entry>;
  readonly changes: Stream.Stream<Entry>;
  readonly push: (href: string) => Effect.Effect<void>;
  readonly replace: (href: string) => Effect.Effect<void>;
  readonly back: Effect.Effect<void>;
}

export class Location extends Context.Service<Location, LocationService>()(
  '@manna/url-state/Location',
) {}

export const relativeHref = (url: URL): string => `${url.pathname}${url.search}${url.hash}`;

export const parseHref = (href: string): URL => new URL(href, 'http://url-state.invalid');
