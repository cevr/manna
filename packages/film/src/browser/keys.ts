import { Context, Effect, Layer, Option, Schema } from 'effect';

export interface KeyPress {
  readonly key: string;
  readonly code: string;
  readonly shift: boolean;
  readonly meta: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly target: Option.Option<EventTarget>;
}

interface KeysOps {
  readonly mac: boolean;
  readonly listen: (take: (press: KeyPress) => boolean) => Effect.Effect<never>;
  readonly within: (part: EventTarget, take: (press: KeyPress) => boolean) => Effect.Effect<never>;
  readonly inputs: (heard: (input: Heard) => void) => Effect.Effect<never>;
}

export const Input = Schema.Literals(['key', 'pointer']);
export type Input = typeof Input.Type;

export interface Heard {
  readonly input: Input;
  readonly walks: () => boolean;
}

export const appleAgent = (userAgent: string): boolean =>
  /\((?:Macintosh|iPhone|iPad|iPod)\b/.test(userAgent);

export class Keys extends Context.Service<Keys, KeysOps>()('@manna/film/browser/Keys') {
  static readonly layerOn = (page: EventTarget, mac = false): Layer.Layer<Keys> =>
    Layer.succeed(Keys, keysOn(page, mac));
}

interface KeyFields extends Pick<Event, 'defaultPrevented' | 'target'> {
  readonly key?: unknown;
  readonly code?: unknown;
  readonly shiftKey?: unknown;
  readonly metaKey?: unknown;
  readonly ctrlKey?: unknown;
  readonly altKey?: unknown;
  readonly isComposing?: unknown;
}

interface PointerFields extends Pick<Event, 'target'> {
  readonly pointerId?: unknown;
}

const heard = (e: KeyFields): boolean =>
  'key' in e && !e.defaultPrevented && e.isComposing !== true;

const pressOf = (e: KeyFields): Option.Option<KeyPress> =>
  Option.liftPredicate(e, heard).pipe(
    Option.map((ev) => ({
      key: String(ev.key),
      code: String(Option.getOrElse(Option.fromNullishOr(ev.code), () => '')),
      shift: ev.shiftKey === true,
      meta: ev.metaKey === true,
      ctrl: ev.ctrlKey === true,
      alt: ev.altKey === true,
      target: Option.fromNullishOr(ev.target),
    })),
  );

const walking = (e: KeyFields): boolean => {
  const key = String(e.key);
  if (key === 'BrowserBack' || key === 'BrowserForward') return true;
  if (e.altKey === true) return key === 'ArrowLeft' || key === 'ArrowRight';
  if (e.metaKey === true) return ['[', ']', 'ArrowLeft', 'ArrowRight'].includes(key);
  return false;
};

const keysOn = (page: EventTarget, mac: boolean): KeysOps => ({
  mac,
  listen: (take) =>
    Effect.callback<never>(() => {
      const listening = new AbortController();
      page.addEventListener(
        'keydown',
        (e) => {
          if (Option.exists(pressOf(e), take)) e.preventDefault();
        },
        { signal: listening.signal },
      );
      return Effect.sync(() => listening.abort());
    }),
  within: (part, take) =>
    Effect.callback<never>(() => {
      const listening = new AbortController();
      part.addEventListener(
        'keydown',
        (e) => {
          if (!Option.exists(pressOf(e), take)) return;
          e.preventDefault();
          e.stopPropagation();
        },
        { signal: listening.signal },
      );
      return Effect.sync(() => listening.abort());
    }),
  inputs: (heard) =>
    Effect.callback<never>(() => {
      const listening = new AbortController();
      const on = { capture: true, signal: listening.signal };
      const down = new Set<unknown>();
      const up = (e: PointerFields) => down.delete(e.pointerId);
      page.addEventListener(
        'keydown',
        (e: KeyFields) => {
          if (down.size > 0) return;
          heard({ input: 'key', walks: () => walking(e) && !e.defaultPrevented });
        },
        on,
      );
      page.addEventListener(
        'pointerdown',
        (e: PointerFields) => {
          down.add(e.pointerId);
          heard({ input: 'pointer', walks: () => false });
        },
        on,
      );
      // oxlint-disable-next-line film/host-events-through-adapter -- Keys' own: whether a pointer is down
      page.addEventListener('pointerup', up, on);
      // oxlint-disable-next-line film/host-events-through-adapter -- Keys' own: whether a pointer is down
      page.addEventListener('pointercancel', up, on);
      page.addEventListener(
        'blur',
        (e) => {
          if (e.target === page) down.clear();
        },
        on,
      );
      return Effect.sync(() => listening.abort());
    }),
});
