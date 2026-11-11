/**
 * The held seek's touch on the web, over the page's sung words: a primary
 * pointer's main button that stays within `SLOP` for `HOLD_MS` takes the
 * hold (`contactAfter` decides each pointer event); from then the pointer is
 * captured, so the drag is followed outside the words, and the page's own
 * touch scroll and wheel are held back (`touchmove` and `wheel` prevented
 * while held; the words take `touch-action: pan-y` before, so a quick
 * vertical swipe still scrolls). The same pointer's main-button lift plays
 * from the choice; a cancel, a lost capture or Escape cancels. The contact
 * is let go before the capture is, so the capture its own lift ends never
 * cancels a release.
 *
 * With no pointer, the words are one focusable region that the keys hold
 * (no control is drawn for it): Enter takes the hold as a still pointer
 * does, the arrows step the choice a line or a word, Enter plays from it
 * and Escape cancels, each through the same seek.
 *
 * The listeners are the area's own, added while it is drawn and removed with
 * it, with the hold's timer.
 */

import { Option } from 'effect';
import { type ReactNode, type RefCallback, useCallback, useEffect, useRef } from 'react';
import { type HostInstance, View } from 'react-native';

import {
  Contact,
  contactAfter,
  HOLD_MS,
  PointerEffect,
  PointerInput,
  type SeekAreaProps,
  type Step,
  useChordTouch,
  useHoldTimer,
} from './word-seek';

/** Whether a pointer that lands on `target` lands on words, not on a control among them (a chord). */
const onWords = (target: Option.Option<EventTarget>) =>
  Option.match(
    Option.filter(target, (one) => one instanceof Element),
    {
      onNone: () => true,
      onSome: (one) =>
        !(one instanceof Element) ||
        Option.isNone(Option.fromNullishOr(one.closest('[role="button"], a, input, button'))),
    },
  );

/** The keys the focused words take: Enter holds and plays from the choice, the arrows step it, Escape cancels. */
const SHORTCUTS = 'Enter ArrowUp ArrowDown ArrowLeft ArrowRight Escape';

const stepKeys = new Map<string, Step>([
  ['ArrowUp', 'prev-line'],
  ['ArrowDown', 'next-line'],
  ['ArrowLeft', 'prev-word'],
  ['ArrowRight', 'next-word'],
]);

/**
 * What `key` on the focused words does: Enter takes the hold, or plays from
 * the choice while the keys hold; an arrow steps the choice while they hold.
 * None for any other key, so the page scrolls by its keys as before.
 */
const keyAction = (key: string, held: boolean): Option.Option<'begin' | 'release' | Step> => {
  if (key === 'Enter') return Option.some((held && 'release') || 'begin');
  if (!held) return Option.none();
  return Option.fromUndefinedOr(stepKeys.get(key));
};

/** The page's scroll on the web: the browser's own, with no recognizer to block (the hold holds back its touch and wheel itself). */
export function SeekScroll({ children }: { readonly children: ReactNode }) {
  return children;
}

export function SeekArea({ seek, style, children }: SeekAreaProps) {
  const chord = useChordTouch();
  const clock = useHoldTimer();
  const now = useRef(seek);
  now.current = seek;
  const node = useRef(Option.none<HostInstance>());
  const keep = useCallback<RefCallback<HostInstance>>((view) => {
    node.current = Option.fromNullishOr(view);
  }, []);
  useEffect(() => {
    const found = node.current;
    if (Option.isNone(found)) return () => {};
    const area = found.value;
    if (!(area instanceof HTMLElement)) return () => {};
    let contact: Contact = Contact.Idle();
    let timer = Option.none<() => void>();
    const disarm = () => {
      Option.map(timer, (stop) => stop());
      timer = Option.none();
    };
    const letGo = (id: number) => {
      area.style.touchAction = 'pan-y';
      if (area.hasPointerCapture(id)) area.releasePointerCapture(id);
    };
    const run = (input: PointerInput) => {
      const [next, effect] = contactAfter(contact, input);
      contact = next;
      perform(effect);
    };
    const deadline = (id: number) => () => {
      timer = Option.none();
      const waiting = contact._tag === 'Candidate' && contact.id === id;
      const acquired = waiting && !chord.recent() && now.current.begin('pointer');
      run(PointerInput.Deadline({ id, acquired }));
    };
    const arm = (id: number) => {
      disarm();
      timer = Option.some(clock.after(HOLD_MS, deadline(id)));
    };
    const perform = (effect: PointerEffect) =>
      PointerEffect.$match(effect, {
        Arm: () => {
          if (contact._tag === 'Candidate') arm(contact.id);
        },
        Disarm: disarm,
        Capture: ({ id }) => {
          area.style.touchAction = 'none';
          area.setPointerCapture(id);
        },
        Drag: ({ dx, dy }) => now.current.drag(dx, dy),
        Release: ({ id }) => {
          now.current.release();
          letGo(id);
        },
        Cancel: ({ id }) => {
          now.current.cancel();
          letGo(id);
        },
        None: () => {},
      });
    const down = (event: PointerEvent) =>
      run(
        PointerInput.Down({
          id: event.pointerId,
          primary: event.isPrimary,
          button: event.button,
          x: event.clientX,
          y: event.clientY,
          startable: now.current.available() && onWords(Option.fromNullishOr(event.target)),
        }),
      );
    const move = (event: PointerEvent) =>
      run(PointerInput.Move({ id: event.pointerId, x: event.clientX, y: event.clientY }));
    const up = (event: PointerEvent) =>
      run(PointerInput.Up({ id: event.pointerId, button: event.button }));
    const lost = (event: PointerEvent) => run(PointerInput.Lost({ id: event.pointerId }));
    const held = (event: Event) => {
      if (contact._tag === 'Held') event.preventDefault();
    };
    const menu = (event: Event) => {
      if (contact._tag !== 'Idle') event.preventDefault();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (contact._tag !== 'Idle') run(PointerInput.Escape());
      else if (Option.contains(now.current.via, 'steps')) now.current.cancel();
    };
    const typed = (event: KeyboardEvent) => {
      if (event.target !== area || contact._tag !== 'Idle') return;
      const held = Option.contains(now.current.via, 'steps');
      const action = keyAction(event.key, held);
      if (Option.isNone(action)) return;
      event.preventDefault();
      const seek = now.current;
      if (action.value === 'begin') seek.begin('steps');
      else if (action.value === 'release') seek.release();
      else seek.step(action.value);
    };
    area.style.touchAction = 'pan-y';
    area.addEventListener('pointerdown', down);
    area.addEventListener('pointermove', move);
    area.addEventListener('pointerup', up);
    area.addEventListener('pointercancel', lost);
    area.addEventListener('lostpointercapture', lost);
    area.addEventListener('touchmove', held, { passive: false });
    area.addEventListener('wheel', held, { passive: false });
    area.addEventListener('contextmenu', menu);
    area.addEventListener('keydown', typed);
    document.addEventListener('keydown', key);
    return () => {
      disarm();
      area.removeEventListener('pointerdown', down);
      area.removeEventListener('pointermove', move);
      area.removeEventListener('pointerup', up);
      area.removeEventListener('pointercancel', lost);
      area.removeEventListener('lostpointercapture', lost);
      area.removeEventListener('touchmove', held);
      area.removeEventListener('wheel', held);
      area.removeEventListener('contextmenu', menu);
      area.removeEventListener('keydown', typed);
      document.removeEventListener('keydown', key);
    };
  }, [chord, clock]);
  return (
    <View
      ref={keep}
      testID="reader-word-seek-area"
      focusable
      role="region"
      aria-label="Sung words"
      aria-keyshortcuts={SHORTCUTS}
      style={style}
    >
      {children}
    </View>
  );
}
