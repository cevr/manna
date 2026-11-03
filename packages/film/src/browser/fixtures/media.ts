import { Effect, Option } from 'effect';
import { type MediaElement, type Playable, playableOf } from '../media.ts';

const LOADED = 4;

class FakeElement extends EventTarget implements MediaElement {
  readonly asked: Array<string> = [];
  readonly plays: Array<Promise<void>> = [];
  refuse: Option.Option<string>;
  paused = true;
  seeking = false;
  ended = false;
  muted = false;
  playbackRate = 1;
  duration = Number.NaN;
  readyState = 0;
  #time = 0;

  constructor(refuse: Option.Option<string>) {
    super();
    this.refuse = refuse;
  }

  get currentTime() {
    return this.#time;
  }

  set currentTime(t: number) {
    this.#time = t;
    this.asked.push(`seek ${t}`);
    if (this.holdsSeeks) return;
    Effect.runFork(
      Effect.andThen(
        Effect.yieldNow,
        Effect.sync(() => this.fire('seeked')),
      ),
    );
  }

  holdsSeeks = false;
  readonly #listening = new Map<string, number>();

  listening(type: string): number {
    return this.#listening.get(type) ?? 0;
  }

  override addEventListener(
    type: string,
    listener: EventListener,
    options: { readonly signal: AbortSignal },
  ) {
    super.addEventListener(type, listener, options);
    if (options.signal.aborted) return;
    this.#listening.set(type, this.listening(type) + 1);
    options.signal.addEventListener(
      'abort',
      () => this.#listening.set(type, this.listening(type) - 1),
      { once: true },
    );
  }

  play() {
    this.asked.push('play');
    const refused = Option.filter(this.refuse, (name) => name !== 'NotAllowedError' || !this.muted);
    if (Option.isNone(refused)) this.paused = false;
    const play = Option.match(refused, {
      // oxlint-disable-next-line effect/noNewPromise -- an element's play() answers a Promise; this is the element
      onNone: () => Promise.resolve(),
      // oxlint-disable-next-line effect/noNewPromise -- as above
      onSome: (name) => Promise.reject(new DOMException('refused', name)),
    });
    this.plays.push(play);
    return play;
  }

  pause() {
    this.asked.push('pause');
    this.paused = true;
  }

  finishLoading(seconds: number) {
    this.duration = seconds;
    this.readyState = LOADED;
    this.fire('loadedmetadata');
    this.fire('canplay');
  }

  load() {
    this.asked.push('load');
  }

  fire(type: string) {
    this.dispatchEvent(new Event(type));
  }
}

export const fakeMedia = (refuse?: string) => {
  const el = new FakeElement(Option.fromUndefinedOr(refuse));
  const media: Playable = playableOf(el);
  // oxlint-disable-next-line effect/noNewPromise -- the plays' own Promises, settled
  const answered = Effect.promise(() => Promise.allSettled(el.plays));
  return { el, media, asked: el.asked, answered };
};
