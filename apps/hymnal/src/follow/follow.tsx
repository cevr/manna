/* oxlint-disable effect/noGlobals -- the follow's host adapter: the follower's clock and timers are the platform's. */

import { RegistryContext, useAtomValue } from '@effect/atom-react';
import { Effect, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import {
  createContext,
  type ReactNode,
  type RefCallback,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import type {
  ColorValue,
  HostInstance,
  LayoutChangeEvent,
  ScrollViewInstance,
  TextStyle,
} from 'react-native';

import { color, useAccent } from '~/color';
import { hymnAt } from '~/hymns/hymns';
import { usePlayer } from '~/player/context';
import type { Beat } from '~/player/countin';
import { type HymnPlayer, Player, trackOf } from '~/player/player';
import { cutOf, keptOf } from '~/player/stanzas';
import { settings } from '~/store';

import { book } from './book';
import { followerOf, type Report } from './follower';
import { handOf } from './hand';
import { introOf } from './intro';
import { type Marks, marksOf, OFF, WHOLE } from './marks';
import { seekCount } from './seeks';
import { placeAt } from './timeline';

interface Follow {
  readonly marks: Marks;
  readonly keep: (index: number, view: HostInstance) => () => void;
  readonly intro: Option.Option<{
    readonly number: number;
    readonly first: number;
    readonly line?: number;
  }>;
}

const still: Follow = { marks: marksOf(), keep: () => () => {}, intro: Option.none() };

const FollowContext = createContext<Follow>(still);

export function FollowProvider({
  value,
  children,
}: {
  readonly value: Follow;
  readonly children: ReactNode;
}) {
  return <FollowContext value={value}>{children}</FollowContext>;
}

const useLineMark = (index: number): number => {
  const { marks } = use(FollowContext);
  const subscribe = useCallback(
    (listener: () => void) => marks.subscribe(index, listener),
    [marks, index],
  );
  const read = () => marks.markOf(index);
  return useSyncExternalStore(subscribe, read, read);
};

export const useLineFollow = (index: number) => {
  const { keep } = use(FollowContext);
  const mark = useLineMark(index);
  const accent = useAccent();
  const counting = useCounting();
  const marked = mark !== OFF;
  const ref = useCallback<RefCallback<HostInstance>>(
    (view) =>
      Option.match(Option.fromNullishOr(view), {
        onNone: () => {},
        onSome: (kept) => keep(index, kept),
      }),
    [keep, index],
  );
  const wordsStyle = wordsStyleOf(mark === WHOLE, counting, accent);
  const syllableStyle = (syllable: number): TextStyle => {
    if (!marked) return {};
    if (mark === WHOLE) return wordsStyle;
    if (syllable === mark && !counting) return { color: accent };
    return { color: color.muted };
  };
  return { marked, ref, syllableStyle, wordsStyle };
};

const wordsStyleOf = (marked: boolean, counting: boolean, accent: ColorValue): TextStyle => {
  if (!marked) return {};
  if (counting) return { backgroundColor: color.soft };
  return { color: accent, backgroundColor: color.soft };
};

const idle = Atom.make<Player>(Player.Idle());

const away: Report = { _tag: 'Away' };

const reportOf = (number: number, state: Player, rate: number, counting: boolean): Report => {
  const here = (
    track: { readonly number: number },
    at: number,
    kind: 'playing' | 'waiting' | 'paused',
  ): Report => {
    if (track.number !== number) return away;
    return { _tag: 'Here', at: at * 1000, state: kind, rate };
  };
  return Player.$match(state, {
    Idle: () => away,
    Loading: () => away,
    Playing: ({ track, at }) => {
      if (counting) return here(track, at, 'paused');
      return here(track, at, 'playing');
    },
    Buffering: ({ track, at }) => here(track, at, 'waiting'),
    Paused: ({ track, at }) => here(track, at, 'paused'),
    Ended: () => away,
    Stopped: () => away,
    Failed: () => away,
  });
};

const dev = typeof __DEV__ !== 'undefined' && __DEV__;

const usePlayerState = () =>
  useAtomValue(Option.match(usePlayer(), { onNone: () => idle, onSome: (player) => player.state }));

const uncounted = Atom.make<Option.Option<Beat>>(Option.none());

const countInOf = (player: Option.Option<HymnPlayer>) =>
  Option.match(player, { onNone: () => uncounted, onSome: (it) => it.countIn });

const useCounting = () => useAtomValue(countInOf(usePlayer()), Option.isSome);

const holds = (state: Player, number: number) =>
  Option.exists(trackOf(state), (track) => track.number === number);

export const useCountIn = () => {
  const { intro } = use(FollowContext);
  const player = usePlayer();
  const registry = use(RegistryContext);
  const state = usePlayerState();
  const atom = countInOf(player);
  const given = useAtomValue(atom);
  const number = Option.match(intro, { onNone: () => Number.NaN, onSome: (it) => it.number });
  const beat = Option.filter(given, () => Player.$is('Playing')(state) && holds(state, number));
  const onBeat = useCallback(
    (listen: (beat: Beat) => void) =>
      Option.match(player, {
        onNone: () => () => {},
        onSome: (it) => {
          let last = Option.none<number>();
          return registry.subscribe(atom, (next) => {
            const fresh = Option.filter(
              next,
              (b) => !Option.contains(last, b.index) && holds(registry.get(it.state), number),
            );
            last = Option.map(next, (b) => b.index);
            Option.map(fresh, listen);
          });
        },
      }),
    [player, registry, atom, number],
  );
  return { beat, onBeat };
};

export const useCountLine = (): number => {
  const { intro } = use(FollowContext);
  return Option.match(intro, { onNone: () => 0, onSome: (it) => it.line ?? 0 });
};

export const useIntro = () => {
  const { intro } = use(FollowContext);
  const state = usePlayerState();
  return {
    intro: Option.flatMap(intro, ({ number, first }) => introOf(number, first, state)),
    running: Player.$is('Playing')(state),
  };
};

const useSung = (number: number) => {
  const choice = useAtomValue(settings.stanzas(number));
  return useMemo(
    () =>
      Option.map(book.of(number), (timeline) =>
        Option.match(hymnAt(String(number)), {
          onNone: () => timeline,
          onSome: (text) => cutOf(timeline, keptOf(text.sections, choice)).timeline,
        }),
      ),
    [number, choice],
  );
};

export const useFollow = (number: number) => {
  const state = usePlayerState();
  const player = usePlayer();
  const registry = use(RegistryContext);
  const scroll = useRef<Option.Option<ScrollViewInstance>>(Option.none());
  const scrollRef = useCallback<RefCallback<ScrollViewInstance>>((node) => {
    scroll.current = Option.fromNullishOr(node);
  }, []);
  const height = useRef(0);
  const views = useRef(new Map<number, HostInstance>());
  const withClock = (event: string) => {
    if (!event.startsWith('line ')) return event;
    if (registry.get(settings.sound)) return `${event} clock=recording`;
    return `${event} clock=score`;
  };

  const sung = useSung(number);

  const follower = useMemo(
    () =>
      Option.map(sung, (timeline) =>
        followerOf(timeline, {
          now: () => performance.now(),
          wake: (ms, run) => {
            const timer = setTimeout(run, ms);
            return () => clearTimeout(timer);
          },
          scrollTo: (line, animated) =>
            Option.all([
              Option.fromNullishOr(views.current.get(line)),
              scroll.current,
              Option.flatMap(scroll.current, (page) =>
                Option.fromNullishOr(page.getInnerViewRef()),
              ),
            ]).pipe(
              Option.map(([view, page, inner]) =>
                view.measureLayout(inner, (_x, y) =>
                  page.scrollTo({ y: Math.max(0, y - height.current / 3), animated }),
                ),
              ),
            ),
          log: (event) => {
            if (!dev) return;
            Effect.runSync(Effect.logInfo(`[follow] ${withClock(event)}`));
          },
        }),
      ),
    [sung, registry],
  );

  const counting = useCounting();
  const counted = useRef(false);
  useEffect(() => {
    const rate = Option.match(player, { onNone: () => 1, onSome: (it) => registry.get(it.rate) });
    const told = reportOf(number, state, rate, counting);
    const starts = counting && told._tag === 'Here' && !counted.current;
    counted.current = counting && told._tag === 'Here';
    Option.map(follower, (f) => {
      f.report(told);
      if (starts) f.show();
    });
  }, [follower, number, state, player, registry, counting]);
  useEffect(
    () => () => Option.match(follower, { onNone: () => {}, onSome: (f) => f.stop() }),
    [follower],
  );
  useEffect(
    () =>
      Option.match(follower, {
        onNone: () => () => {},
        onSome: (f) => {
          let heard = registry.get(seekCount);
          return registry.subscribe(seekCount, (count) => {
            if (count === heard) return;
            heard = count;
            f.seek();
          });
        },
      }),
    [follower, registry],
  );

  const follow = useMemo<Follow>(
    () =>
      Option.match(follower, {
        onNone: () => still,
        onSome: ({ marks }) => ({
          marks,
          intro: Option.map(book.of(number), ({ first }) => ({
            number,
            first,
            line: Option.match(sung, {
              onNone: () => 0,
              onSome: (timeline) => Math.max(0, placeAt(timeline, first).line),
            }),
          })),
          keep: (index, view) => {
            views.current.set(index, view);
            return () => {
              if (views.current.get(index) === view) views.current.delete(index);
            };
          },
        }),
      }),
    [follower, number, sung],
  );

  const subscribeHeld = useCallback(
    (listener: () => void) =>
      Option.match(follower, {
        onNone: () => () => {},
        onSome: (f) => f.held.subscribe(listener),
      }),
    [follower],
  );
  const readHeld = () =>
    Option.match(follower, { onNone: () => false, onSome: (f) => f.held.get() });
  const held = useSyncExternalStore(subscribeHeld, readHeld, readHeld);

  return {
    follow,
    scroll: scrollRef,
    held,
    resume: () => Option.map(follower, (f) => f.resume()),
    hand: handOf(() => Option.map(follower, (f) => f.drag())),
    onLayout: (event: LayoutChangeEvent) => {
      height.current = event.nativeEvent.layout.height;
    },
    onContentSizeChange: () => Option.map(follower, (f) => f.relayout()),
  };
};
