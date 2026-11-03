import { Effect, Layer, Scope } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { glCanvas } from '../gl.ts';
import { offscreen } from '../paper.ts';
import { armFilm, armScene } from './arm.ts';
import { loadRigs } from '../../rive/load.ts';
import { RiveRuntimeBrowser } from '../../rive/runtime-browser.ts';

export interface RiveFrame {
  readonly at: number;
  readonly hash: string;
  readonly rigPixels: number;
}

const contexts: Array<WebGL2RenderingContext> = [];
const contextOf = HTMLCanvasElement.prototype.getContext;
const isGl2 = (v: unknown): v is WebGL2RenderingContext =>
  v !== null && v !== undefined && Reflect.has(Object(v), 'isContextLost');
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value(this: HTMLCanvasElement, ...args: Parameters<HTMLCanvasElement['getContext']>) {
    const made: unknown = Reflect.apply(contextOf, this, args);
    if (args[0] === 'webgl2' && isGl2(made)) contexts.push(made);
    return made;
  },
});

const film = armFilm([armScene('arm', 'webgl2')]);
const bare = armFilm([{ id: 'arm', min: 4, draw: () => {} }]);

const loaded = Effect.runPromise(
  Effect.flatMap(Scope.make(), (scope) => Scope.provide(loadRigs(film), scope)).pipe(
    Effect.provide(Layer.provideMerge(RiveRuntimeBrowser, FetchHttpClient.layer)),
  ),
);

const frame = offscreen(film.width, film.height);
const empty = offscreen(film.width, film.height);

const fnv = (bytes: Uint8ClampedArray) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ (bytes[i] ?? 0), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
};

const BOX = { x: film.width / 2 - 200, y: film.height / 2 - 200, w: 400, h: 400 };

const riveFrames = (history: ReadonlyArray<number>, targets: ReadonlyArray<number>) =>
  loaded.then(() =>
    targets.map((at): RiveFrame => {
      for (const t of history) film.render(frame.ctx, t);
      film.render(frame.ctx, at);
      bare.render(empty.ctx, at);
      const drawn = frame.ctx.getImageData(0, 0, film.width, film.height).data;
      const a = frame.ctx.getImageData(BOX.x, BOX.y, BOX.w, BOX.h).data;
      const b = empty.ctx.getImageData(BOX.x, BOX.y, BOX.w, BOX.h).data;
      let rigPixels = 0;
      for (let i = 0; i < a.length; i += 4)
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) rigPixels += 1;
      return { at, hash: fnv(drawn), rigPixels };
    }),
  );

export interface AfterLoss {
  readonly before: string;
  readonly after: string;
  readonly lost: number;
}

const crowd: Array<unknown> = [];

const riveAfterLoss = (at: number, how: 'cap' | 'budget') =>
  loaded.then((): AfterLoss => {
    film.render(frame.ctx, at);
    const before = fnv(frame.ctx.getImageData(0, 0, film.width, film.height).data);
    const rigs = [...contexts];
    for (let i = 0; i < (how === 'cap' ? 16 : 0); i++) {
      const canvas = document.createElement('canvas');
      crowd.push(canvas, canvas.getContext('webgl2'));
    }
    for (let i = 0; i < (how === 'budget' ? 8 : 0); i++)
      crowd.push(glCanvas(`rive-pixels/${i}`, 4, 4));
    const lost = rigs.filter((gl) => gl.isContextLost()).length;
    film.render(frame.ctx, at);
    const after = fnv(frame.ctx.getImageData(0, 0, film.width, film.height).data);
    return { before, after, lost };
  });

Object.assign(window, { riveFrames, riveAfterLoss });
