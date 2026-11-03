import { Option } from 'effect';
import { placeTo, revealTo } from './follow-rule.ts';
import { type Accessor, createEffect, createSignal, untrack } from 'solid-js';

const SLACK = 1;

interface Span {
  readonly first: HTMLElement;
  readonly last: HTMLElement;
}

interface FollowOptions {
  readonly box: () => Option.Option<HTMLElement>;
  readonly content: () => Option.Option<HTMLElement>;
  readonly target: Accessor<string>;
  readonly span: (key: string) => Option.Option<Span>;
  readonly clear: (box: HTMLElement) => { readonly top: number; readonly bottom: number };
  readonly following: Following;
  readonly opened?: Accessor<string>;
}

export interface Following {
  readonly on: Accessor<boolean>;
  readonly resume: () => void;
  readonly suspend: () => void;
}

export const createFollowing = (): Following => {
  const [on, setOn] = createSignal(true, { ownedWrite: true });
  return { on, resume: () => setOn(true), suspend: () => setOn(false) };
};

export interface FollowClock {
  readonly drawn: Accessor<unknown>;
  readonly playing: () => boolean;
}

const extentOf = (box: HTMLElement, span: Span) => {
  const origin = box.getBoundingClientRect().top - box.scrollTop;
  const first = span.first.getBoundingClientRect();
  const last = Option.getOrElse(
    Option.liftPredicate(span.last, (row) => row !== span.first).pipe(
      Option.map((row) => row.getBoundingClientRect()),
    ),
    () => first,
  );
  return { top: first.top - origin, bottom: last.bottom - origin };
};

export const useFollow = (options: FollowOptions, clock: FollowClock): (() => boolean) => {
  const playingNow = () => untrack(clock.playing);
  let anchor = 0;
  const [laidOut, setLaidOut] = createSignal(0);
  const readerMoved = (box: HTMLElement): boolean => {
    const at = box.scrollTop;
    if (Math.abs(at - anchor) <= SLACK) return false;
    const clamped = Math.min(anchor, box.scrollHeight - box.clientHeight);
    if (Math.abs(at - clamped) > SLACK) return true;
    anchor = clamped;
    return false;
  };

  let wasPlaying = false;
  createEffect(
    () => clock.drawn(),
    () => {
      const playing = playingNow();
      if (playing && !wasPlaying) untrack(options.following.resume);
      wasPlaying = playing;
    },
  );

  createEffect(
    () => true,
    () =>
      Option.match(Option.all({ box: options.box(), content: options.content() }), {
        onNone: () => () => {},
        onSome: ({ box, content }) => {
          anchor = box.scrollTop;
          const o = new ResizeObserver(() => setLaidOut((n) => n + 1));
          o.observe(box);
          o.observe(content);
          const scrolled = () => {
            if (readerMoved(box)) options.following.suspend();
          };
          box.addEventListener('scroll', scrolled, { passive: true });
          return () => {
            o.disconnect();
            box.removeEventListener('scroll', scrolled);
          };
        },
      }),
  );

  const opened = () =>
    Option.getOrElse(
      Option.map(Option.fromUndefinedOr(options.opened), (o) => o()),
      () => '',
    );

  let heldByPress = false;

  let wasPlacing = untrack(options.following.on);
  createEffect(
    () => [options.target(), laidOut(), options.following.on()] as const,
    ([key, , on]) => {
      const takenBack = on && !wasPlacing;
      wasPlacing = on;
      if (takenBack) {
        heldByPress = false;
        Option.map(options.box(), (box) => {
          anchor = box.scrollTop;
        });
      }
      if (!on || heldByPress || key === '') return;
      if (!takenBack && untrack(opened) !== '' && !playingNow()) return;
      Option.map(
        Option.flatMap(options.box(), (box) =>
          Option.map(options.span(key), (span) => ({ box, span })),
        ),
        ({ box, span }) => {
          if (span.first.getClientRects().length === 0) return;
          if (readerMoved(box)) return options.following.suspend();
          Option.map(placeTo(box, extentOf(box, span), options.clear(box)), (to) => {
            box.scrollTo({ top: to, behavior: 'instant' });
            anchor = box.scrollTop;
          });
        },
      );
    },
  );

  let revealed = '';
  createEffect(
    () => [opened(), laidOut()] as const,
    ([key]) => {
      const fresh = key !== revealed;
      revealed = key;
      if (key === '' || (!fresh && playingNow())) return;
      if (fresh && playingNow()) {
        heldByPress = true;
        options.following.suspend();
      }
      Option.map(
        Option.flatMap(options.box(), (box) =>
          Option.map(options.span(key), (span) => ({ box, span })),
        ),
        ({ box, span }) => {
          if (span.first.getClientRects().length === 0) return;
          if (readerMoved(box)) {
            options.following.suspend();
            if (!fresh) return;
          }
          const to = revealTo(
            box,
            extentOf(box, span),
            () => extentOf(box, { first: span.last, last: span.last }).top,
            options.clear(box),
          );
          if (Math.abs(to - box.scrollTop) > SLACK) box.scrollTo({ top: to, behavior: 'instant' });
          anchor = box.scrollTop;
        },
      );
    },
  );

  return () =>
    Option.match(options.box(), {
      onNone: () => false,
      onSome: (box) => {
        if (heldByPress || !untrack(options.following.on)) return true;
        if (!readerMoved(box)) return false;
        options.following.suspend();
        return true;
      },
    });
};
