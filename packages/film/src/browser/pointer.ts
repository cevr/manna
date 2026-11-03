import { LONG_PRESS_MOVE_THRESHOLD, claimPress, liftHeldByOther } from '@manna/ui/press';
import { Context, Effect, Layer, Option, Result } from 'effect';

interface DragSteps {
  readonly move: (event: PointerEvent) => void;
  readonly end: (lifted: Option.Option<PointerEvent>) => void;
}

interface Surface {
  readonly name: string;
}

interface PointerOps {
  readonly press: (
    down: PointerEvent,
    surface: Surface,
    take: () => Option.Option<DragSteps>,
  ) => Effect.Effect<void>;
}

export class Pointer extends Context.Service<Pointer, PointerOps>()('@manna/film/browser/Pointer') {
  static readonly layerOn = (page: EventTarget): Layer.Layer<Pointer> =>
    Layer.succeed(Pointer, pointerOn(page));
}

const captures = (target: EventTarget): target is Element => 'setPointerCapture' in target;

const pointerOn = (page: EventTarget): PointerOps => {
  const holding = new WeakSet<Surface>();
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
      const ours = (e: Event): e is PointerEvent => 'pointerId' in e && e.pointerId === id;
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
