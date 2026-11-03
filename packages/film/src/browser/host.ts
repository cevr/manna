import { Location, UrlState } from '@manna/url-state';
import { Clock, Effect, Layer, Option, Scope } from 'effect';
import type { Context } from 'effect';
import { pageMove } from '../core/api.ts';
import type { Clipboard } from './clipboard.ts';
import type { Footage } from './footage.ts';
import type { Frames } from './frames.ts';
import type { Highlights } from './highlights.ts';
import type { Keys } from './keys.ts';
import type { Media } from './media.ts';
import type { PageLoad } from './page-load.ts';
import type { Pointer } from './pointer.ts';
import type { Viewport } from './viewport.ts';

export type BrowserServices =
  | Clipboard
  | Footage
  | Frames
  | Highlights
  | Keys
  | Location
  | Media
  | PageLoad
  | Pointer
  | UrlState.UrlState
  | Viewport;

export type Host = Context.Context<BrowserServices>;

export const hostOf = <S>(layer: Layer.Layer<S>): Context.Context<S> =>
  Effect.runSync(Effect.flatMap(Scope.make(), (scope) => Layer.buildWithScope(layer, scope)));

export const hostLayer = (host: Host): Layer.Layer<BrowserServices> => Layer.succeedContext(host);

interface AddressBar {
  readonly href: () => string;
  readonly go: (href: string) => void;
  readonly follow: (href: string) => void;
  readonly dismiss: (opened: Option.Option<Opened>, to: Option.Option<string>) => void;
}

export interface Opened {
  readonly key: string;
  readonly before: string;
}

const samePlace = (a: string, b: string): boolean => {
  const [x, y] = [new URL(a, 'http://place'), new URL(b, 'http://place')];
  x.searchParams.sort();
  y.searchParams.sort();
  return x.pathname === y.pathname && x.search === y.search && x.hash === y.hash;
};

export const addressOn = (host: Context.Context<UrlState.UrlState | Location>): AddressBar => {
  const navigate = (to: string, history: (from: string) => 'push' | 'replace') =>
    Effect.runSyncWith(host)(
      Effect.gen(function* () {
        const { href: from } = yield* Location.use((bar) => bar.current);
        yield* UrlState.UrlState.use((url) =>
          url.navigate(to, { history: history(from), throttle: Option.none() }),
        );
      }),
    );
  const follow = (to: string) => navigate(to, () => 'replace');
  return {
    href: () => Effect.runSyncWith(host)(UrlState.UrlState.use((url) => url.href)),
    go: (to) => navigate(to, (from) => pageMove(from, to)),
    follow,
    dismiss: (opened, to) => {
      const { key } = Effect.runSyncWith(host)(Location.use((bar) => bar.current));
      const back = Option.exists(
        opened,
        (o) =>
          o.key === key &&
          Option.match(to, { onNone: () => true, onSome: (place) => samePlace(o.before, place) }),
      );
      if (back) {
        Effect.runForkWith(host)(Location.use((bar) => bar.back));
        return;
      }
      Option.map(to, follow);
    },
  };
};

export const monotonicMs = <S>(host: Context.Context<S>): (() => number) => {
  const clock = Effect.runSyncWith(host)(Clock.clockWith(Effect.succeed));
  return () => Number(clock.monotonicTimeNanosUnsafe()) / 1e6;
};
