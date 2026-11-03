import { Context, Effect, Layer, Option, Schema } from 'effect';

/** A key press as the pages read it. */
export interface KeyPress {
  /** `KeyboardEvent.key`. */
  readonly key: string;
  /** `KeyboardEvent.code`: the physical key (`KeyO`), the empty text when the event has none. */
  readonly code: string;
  readonly shift: boolean;
  readonly meta: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  /** Where the press was aimed: the element focus was on. */
  readonly target: Option.Option<EventTarget>;
}

interface KeysOps {
  /** Whether the keyboard is a Mac's: its command key is ⌘ (a chord's `mod`), not Ctrl. */
  readonly mac: boolean;
  /**
   * Hear the page's key presses until interrupted: `take` gets each and
   * answers whether it took it (its default is then prevented).
   */
  readonly listen: (take: (press: KeyPress) => boolean) => Effect.Effect<never>;
  /**
   * Hear the presses inside `part` before they leave it, until interrupted:
   * a wrapper that keeps some from the page (a dialog stops the arrow keys)
   * never keeps them from `take`. A press it takes has its default prevented
   * and goes no further, so the page never hears it twice.
   */
  readonly within: (part: EventTarget, take: (press: KeyPress) => boolean) => Effect.Effect<never>;
  /**
   * Hear which input the viewer uses until interrupted: `heard` gets `key`
   * for every key pressed, unless a pointer is down (a key in the middle of a
   * click is the click's), and `pointer` for every pointer put down (a mouse,
   * a pen, a finger), handled by a control or not.
   */
  readonly inputs: (heard: (input: Heard) => void) => Effect.Effect<never>;
}

/**
 * The input that asked for a move: a key pressed, or a pointer put down. The
 * lab shows its focus ring where the keyboard asked (`lab/focus.ts`). The one
 * declaration: the hub, the studio's slot and the e2e walkers read this.
 */
export const Input = Schema.Literals(['key', 'pointer']);
export type Input = typeof Input.Type;

/** An input heard: which, and for a key, whether it is one the browser walks the history by. */
export interface Heard {
  readonly input: Input;
  /**
   * Whether the press is a key the browser steps back or forward by (Alt+← or
   * Alt+→; ⌘[, ⌘], ⌘← or ⌘→; a keyboard's own Back and Forward keys) that no
   * control on the page took for its own: read when the step comes, after
   * every control has heard the press.
   */
  readonly walks: () => boolean;
}

/**
 * Whether a browser is on an Apple device, whose keyboard is a Mac's (its
 * command key ⌘), by its `User-Agent`: the device its parentheses open with
 * is a Mac (`Macintosh`), an iPhone, an iPad or an iPod. The rule a page
 * reads its keys and labels its chords by, read from one string on both
 * sides: the server from the request's header, the browser from
 * `navigator.userAgent`, the same string, so a page's first paint and its
 * hydration label every chord alike.
 */
export const appleAgent = (userAgent: string): boolean =>
  /\((?:Macintosh|iPhone|iPad|iPod)\b/.test(userAgent);

export class Keys extends Context.Service<Keys, KeysOps>()('@manna/film/browser/Keys') {
  /** Presses heard on `page` (the window live, a test's `EventTarget` in a test), from a Mac's keyboard or not. */
  static readonly layerOn = (page: EventTarget, mac = false): Layer.Layer<Keys> =>
    Layer.succeed(Keys, keysOn(page, mac));
}

/**
 * An event as a key press may carry it: each field unknown until read, as
 * the page hears `Event`s (a test's carries them as its own).
 */
interface KeyFields extends Pick<Event, 'defaultPrevented' | 'target'> {
  readonly key?: unknown;
  readonly code?: unknown;
  readonly shiftKey?: unknown;
  readonly metaKey?: unknown;
  readonly ctrlKey?: unknown;
  readonly altKey?: unknown;
  readonly isComposing?: unknown;
}

/** A pointer event as the page hears it: its pointer's id, unknown until read. */
interface PointerFields extends Pick<Event, 'target'> {
  readonly pointerId?: unknown;
}

/** Whether `e` is a press the page hears: not handled already, not composing text. */
const heard = (e: KeyFields): boolean =>
  'key' in e && !e.defaultPrevented && e.isComposing !== true;

/** The key press `e` is, if the page hears it. */
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

/** Whether `e` is a chord the browser walks the history by. */
const walking = (e: KeyFields): boolean => {
  const key = String(e.key);
  if (key === 'BrowserBack' || key === 'BrowserForward') return true;
  if (e.altKey === true) return key === 'ArrowLeft' || key === 'ArrowRight';
  if (e.metaKey === true) return ['[', ']', 'ArrowLeft', 'ArrowRight'].includes(key);
  return false;
};

/** The key presses on `page`. */
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
