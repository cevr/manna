import { LONG_PRESS_MOVE_THRESHOLD, claimPress, liftHeldByOther } from '@manna/ui/press';
import { Context, Effect, Layer, Option, Result } from 'effect';

/** What a drag tells its owner. */
interface DragSteps {
  /** Each move of the pressed pointer. */
  readonly move: (event: PointerEvent) => void;
  /** The press is over, once: lifted (its `pointerup`), or none when the browser ended it. */
  readonly end: (lifted: Option.Option<PointerEvent>) => void;
}

/**
 * What follows one press at a time (`Pointer.press`): a view makes one object
 * for each part of the page a press drags on, named as the page names it, and
 * passes that same object with each press on it.
 */
interface Surface {
  readonly name: string;
}

interface PointerOps {
  /**
   * The press `down` on `surface`, taken only while it holds no press:
   * `take` is the press's own work, run at once, and answers the drag to
   * follow, whose moves and end go to its steps and which the surface holds
   * until it ends or is interrupted (interrupted, it stops listening and
   * tells nothing more); none, a press with nothing to follow, holds
   * nothing. A press while the surface holds one is not the surface's:
   * `take` never runs. Call it in the press's own handler, so nothing of
   * the press is missed.
   */
  readonly press: (
    down: PointerEvent,
    surface: Surface,
    take: () => Option.Option<DragSteps>,
  ) => Effect.Effect<void>;
}

export class Pointer extends Context.Service<Pointer, PointerOps>()('@manna/film/browser/Pointer') {
  /** Drags heard on `page`: the window live, a test's `EventTarget` in a test. */
  static readonly layerOn = (page: EventTarget): Layer.Layer<Pointer> =>
    Layer.succeed(Pointer, pointerOn(page));
}

/** Whether `target` can hold a pointer's capture. */
const captures = (target: EventTarget): target is Element => 'setPointerCapture' in target;

/** The drags of the presses on `page`. */
const pointerOn = (page: EventTarget): PointerOps => {
  /** The surfaces following a press now. */
  const holding = new WeakSet<Surface>();
  /** The press `down` began, followed until it ends: done then. */
  const drag = (down: PointerEvent, steps: DragSteps): Effect.Effect<void> =>
    Effect.callback<void>((resume) => {
      const id = down.pointerId;
      const held = Option.filter(Option.fromNullishOr(down.currentTarget), captures);
      Option.map(held, (el) =>
        // oxlint-disable-next-line film/host-events-through-adapter -- Pointer's own: the press it follows
        Result.try(() => el.setPointerCapture(id)),
      );
      const listening = new AbortController();
      const options = { signal: listening.signal };
      /** Whether `e` is of this press's pointer. */
      const ours = (e: Event): e is PointerEvent => 'pointerId' in e && e.pointerId === id;
      /** `f`, for this press's pointer only. */
      const its = (f: (e: PointerEvent) => void) => (e: Event) => {
        if (ours(e)) f(e);
      };
      const ended = (lifted: Option.Option<PointerEvent>) => {
        listening.abort();
        steps.end(lifted);
        resume(Effect.void);
      };
      const self = Symbol('drag');
      let started = down.pointerType !== 'touch';
      const past = (e: PointerEvent) =>
        Math.abs(e.clientX - down.clientX) > LONG_PRESS_MOVE_THRESHOLD ||
        Math.abs(e.clientY - down.clientY) > LONG_PRESS_MOVE_THRESHOLD;
      page.addEventListener(
        'pointermove',
        its((e) => {
          started = started || (past(e) && claimPress(id, self, page));
          if (started) steps.move(e);
        }),
        options,
      );
      // oxlint-disable-next-line film/host-events-through-adapter -- Pointer's own: the press's lift
      page.addEventListener(
        'pointerup',
        its((e) => ended(Option.filter(Option.some(e), () => !liftHeldByOther(id, self)))),
        options,
      );
      // oxlint-disable-next-line film/host-events-through-adapter -- Pointer's own: the browser took the press
      page.addEventListener(
        'pointercancel',
        its(() => ended(Option.none())),
        options,
      );
      // oxlint-disable-next-line film/host-events-through-adapter -- Pointer's own: the capture let go
      page.addEventListener(
        'lostpointercapture',
        its(() => ended(Option.none())),
        options,
      );
      for (const left of ['blur', 'visibilitychange'])
        page.addEventListener(left, () => ended(Option.none()), options);
      return Effect.sync(() => listening.abort());
    });
  return {
    press: (down, surface, take) =>
      Effect.suspend(() => {
        if (holding.has(surface)) return Effect.void;
        return Option.match(take(), {
          onNone: () => Effect.void,
          onSome: (steps) => {
            holding.add(surface);
            return Effect.ensuring(
              drag(down, steps),
              Effect.sync(() => holding.delete(surface)),
            );
          },
        });
      }),
  };
};
