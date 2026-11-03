import { Option } from 'effect';
import { placeTo, revealTo } from './follow-rule.ts';
import { type Accessor, createEffect, createSignal, untrack } from 'solid-js';

/** How far a scroll may land from where the view put the box and still be the view's: rounding to the device's pixels. */
const SLACK = 1;

/** The rows a target spans in its box: one row, or the first and the last of several. */
interface Span {
  readonly first: HTMLElement;
  readonly last: HTMLElement;
}

interface FollowOptions {
  /** The box that scrolls, once it is laid out. */
  readonly box: () => Option.Option<HTMLElement>;
  /** What the box scrolls, watched for a resize too. */
  readonly content: () => Option.Option<HTMLElement>;
  /** The target as a key: `''` for none. A frame that does not move the target keeps the key. */
  readonly target: Accessor<string>;
  /** The rows the target `key` spans, as they stand. */
  readonly span: (key: string) => Option.Option<Span>;
  /** How much of the box's top and bottom a row must keep clear of to count as in sight. */
  readonly clear: (box: HTMLElement) => { readonly top: number; readonly bottom: number };
  /** Whether the view places the box now (no reader has taken it): told when a reader scrolls it, and on Play. */
  readonly following: Following;
  /**
   * What a press opened under the rows, as a key (`''` for none; its rows
   * from `span`, the last the box it opened): brought into sight once, as
   * the key changes, whether or not the view is placing.
   */
  readonly opened?: Accessor<string>;
}

/**
 * Whether a view places its box: on until a reader scrolls it (`suspend`),
 * and on again on Play, its Follow button (`follow-button.tsx`) or a seek of
 * the view's own (`resume`). The view makes one and gives it to `useFollow`.
 */
export interface Following {
  readonly on: Accessor<boolean>;
  readonly resume: () => void;
  readonly suspend: () => void;
}

/** A view's `Following`, on as it mounts. */
export const createFollowing = (): Following => {
  const [on, setOn] = createSignal(true, { ownedWrite: true });
  return { on, resume: () => setOn(true), suspend: () => setOn(false) };
};

/** The page's clock as Follow hears it: a signal that moves with each frame drawn, and whether it plays. */
export interface FollowClock {
  readonly drawn: Accessor<unknown>;
  readonly playing: () => boolean;
}

/**
 * The span's top and bottom in the box's own scroll coordinates, whatever sits
 * between them: each of its rows asked once, so a one-row span is one read.
 */
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

/**
 * Follow `options.target` in `options.box` while `options.following.on()`, by the rule above, on the page's `clock`.
 * Mount it with the view. Answers whether a reader has the box now, its scroll event heard or still on its way
 * (`following.suspend` told if so): what anything that would move the view on the page's word (a settle on a line) asks first.
 */
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

  /** What a press opened under the rows, as its key: `''` while nothing is open, or for a view that opens nothing. */
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
