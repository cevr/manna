import { Effect, Option } from 'effect';
import type { Context } from 'effect';
import type { Film, RenderOptions } from '../canvas/film.ts';
import { type Footage, type FootageShown, footageAt, readsFootage } from '../browser/footage.ts';
import { pictureFacesWait } from './face.ts';

interface StillSource extends Pick<Film, 'footageAt'> {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly render: (ctx: CanvasRenderingContext2D, T: number, opts?: RenderOptions) => void;
}

interface Stills {
  readonly width: number;
  readonly height: number;
  readonly at: (t: number) => Option.Option<HTMLCanvasElement>;
  readonly want: (times: ReadonlyArray<number>) => void;
  readonly onDrawn: (listener: (t: number) => void) => () => void;
  readonly ready: () => Promise<void>;
  readonly all: (
    times: ReadonlyArray<number>,
    progress?: (done: number, of: number) => void,
  ) => Promise<ReadonlyArray<HTMLCanvasElement>>;
  readonly drawn: () => { readonly count: number; readonly ms: number };
  readonly stop: () => void;
}

interface StillsOptions {
  readonly width: number;
  readonly captions: boolean;
  readonly turn: () => Promise<unknown>;
  readonly now: () => number;
  readonly footage: Context.Context<Footage>;
}

const canvasOf = (width: number, height: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2d context unavailable');
  return { canvas, ctx };
};

export const makeStills = (film: StillSource, options: StillsOptions): Stills => {
  const width = Math.round(options.width);
  const height = Math.round((width * film.height) / film.width);
  const frameOf = (t: number) => Math.max(0, Math.round(t * film.fps));
  const kept = new Map<number, HTMLCanvasElement>();
  let queue: ReadonlyArray<{ readonly frame: number; readonly t: number }> = [];
  const listeners = new Set<(t: number) => void>();
  let full = Option.none<{
    readonly ctx: CanvasRenderingContext2D;
    readonly canvas: HTMLCanvasElement;
  }>();
  let running = false;
  let stopped = false;
  let count = 0;
  let ms = 0;

  let failed = Option.none<unknown>();
  const failures = new Set<(why: unknown) => void>();

  const draw = (t: number, frame: number, shown: FootageShown) => {
    const began = options.now();
    const frameCanvas = Option.getOrElse(full, () => {
      const made = canvasOf(film.width, film.height);
      full = Option.some(made);
      return made;
    });
    film.render(frameCanvas.ctx, t, { captions: options.captions, ...shown });
    const still = canvasOf(width, height);
    still.ctx.imageSmoothingQuality = 'high';
    still.ctx.drawImage(frameCanvas.canvas, 0, 0, width, height);
    kept.set(frame, still.canvas);
    count += 1;
    ms += options.now() - began;
    for (const listener of listeners) listener(t);
  };

  const step = (): Promise<void> => {
    const [next, ...rest] = queue;
    if (next === undefined || stopped) {
      running = false;
      return Promise.resolve();
    }
    queue = rest;
    if (kept.has(next.frame)) return step();
    if (!readsFootage(film)) {
      draw(next.t, next.frame, {});
      return options.turn().then(step);
    }
    return Effect.runPromiseWith(options.footage)(footageAt(film, next.t)).then(
      (shown) => {
        if (!stopped) draw(next.t, next.frame, shown);
        return options.turn().then(step);
      },
      (why: unknown) => {
        running = false;
        failed = Option.some(why);
        for (const failure of failures) failure(why);
      },
    );
  };
  let faces = Option.none<Option.Option<Promise<void>>>();
  const facesLoad = () =>
    Option.getOrElse(faces, () => {
      const load = Option.map(pictureFacesWait(document.fonts), (wait) => Effect.runPromise(wait));
      faces = Option.some(load);
      return load;
    });
  const ready = () => Option.getOrElse(facesLoad(), () => Promise.resolve());
  const run = () => {
    if (running || Option.isSome(failed)) return;
    running = true;
    Option.match(facesLoad(), {
      onNone: () => void step(),
      onSome: (load) =>
        void load.then(step, () => {
          running = false;
        }),
    });
  };

  const want = (times: ReadonlyArray<number>) => {
    if (stopped) return;
    const first = times.map((t) => ({ frame: frameOf(t), t })).filter((w) => !kept.has(w.frame));
    const asked = new Set(first.map((w) => w.frame));
    queue = [...first, ...queue.filter((w) => !asked.has(w.frame))];
    run();
  };

  const at = (t: number) => Option.fromUndefinedOr(kept.get(frameOf(t)));

  return {
    width,
    height,
    at,
    want,
    onDrawn: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ready,
    all: (times, progress) =>
      new Promise((resolve, reject) => {
        const frames = times.map(frameOf);
        const left = () => frames.filter((f) => !kept.has(f)).length;
        const settle = () => {
          progress?.(times.length - left(), times.length);
          if (left() > 0) return false;
          stop();
          resolve(frames.map((f) => kept.get(f)).filter((c) => c !== undefined));
          return true;
        };
        const stop = () => {
          listeners.delete(heard);
          failures.delete(fail);
        };
        const heard = () => {
          settle();
        };
        const fail = (why: unknown) => {
          stop();
          reject(why);
        };
        listeners.add(heard);
        if (settle()) return;
        if (Option.isSome(failed)) return fail(failed.value);
        failures.add(fail);
        want(times);
        ready().catch((why: unknown) => {
          stop();
          reject(why);
        });
      }),
    drawn: () => ({ count, ms }),
    stop: () => {
      stopped = true;
      queue = [];
      listeners.clear();
      failures.clear();
    },
  };
};
