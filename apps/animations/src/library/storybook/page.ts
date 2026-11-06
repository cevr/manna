import { Effect, Option } from 'effect';
import {
  type PaintRequest,
  type PaintScene,
  type Pictures,
  type Prepared,
  canvasOf,
  paintFrame,
  prepare,
} from './painter.ts';
import type { Box } from './sheet.ts';

/** Every picture a scene names: its data URL is its id. */
const picturesOf = (scene: PaintScene): ReadonlyArray<string> =>
  scene.layers.flatMap((l) =>
    l.items.flatMap((i) => {
      if (i._tag === 'Plate') return [i.image];
      return [
        ...Object.values(i.cells).map((c) => c.image),
        ...(i.rig?.parts ?? []).flatMap((p) => Object.values(p.images).map((x) => x.image)),
      ];
    }),
  );

/** A picture decoded, with the data URL it came from. */
const decoded = (url: string) => {
  const image = new Image();
  image.src = url;
  return Effect.promise(() => image.decode()).pipe(Effect.as([url, image] as const));
};

/**
 * The page's pictures: each decoded image's pixels read off a canvas of its
 * size, and a draw of it from a CPU canvas of those pixels (`canvasOf`, held
 * once per picture), as a cell is drawn and as a film's storybook scene draws
 * every picture: a canvas and a decoded image are resampled differently when
 * the camera enlarges them.
 */
const picturesFrom = (images: ReadonlyMap<string, HTMLImageElement>): Pictures => {
  const pixels: Pictures['pixels'] = (id, size) =>
    Option.flatMap(Option.fromUndefinedOr(images.get(id)), (image) => {
      const canvas = document.createElement('canvas');
      canvas.width = size[0];
      canvas.height = size[1];
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return Option.none();
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, size[0], size[1]);
      return Option.some({
        width: size[0],
        height: size[1],
        rgba: new Uint8Array(data.data.buffer),
      });
    });
  const held = new Map<string, Option.Option<HTMLCanvasElement>>();
  return {
    pixels,
    draw: (ctx, id, size) => {
      const canvas =
        held.get(id) ??
        held.set(id, Option.map(pixels(id, size), canvasOf)).get(id) ??
        Option.none();
      if (Option.isSome(canvas)) ctx.drawImage(canvas.value, 0, 0);
    },
  };
};

/** A canvas and its 2d context. */
interface Surface {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
}

/** A canvas made once and resized to each size asked of it, cleared; none without a 2d context. */
const scratchSurface = () => {
  const canvas = document.createElement('canvas');
  const ctx = Option.fromNullishOr(canvas.getContext('2d'));
  return (width: number, height: number): Option.Option<Surface> =>
    Option.map(ctx, (c) => {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, width, height);
      return { canvas, ctx: c };
    });
};

/** The part of `box` at or right of and below the frame's origin, in the frame's px: what a canvas at the frame's own transform can paint. */
const originQuadrantOf = (box: Box): Option.Option<Box> => {
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  const width = box.x + box.width - x;
  const height = box.y + box.height - y;
  if (width <= 0 || height <= 0) return Option.none();
  return Option.some({ x, y, width, height });
};

/**
 * The page's renderer for one scene whose pictures are decoded and
 * prepared: each request painted from itself alone (`paintFrame`) over
 * `box`, answered as a PNG data URL, or why not.
 *
 * The whole frame paints on the frame's canvas at the frame's own
 * transform. Any other box is an analysis surface. Its part right of and
 * below the frame's origin paints at that very transform, unmoved, on a
 * canvas grown to hold it, and is copied in whole px; so every pixel the
 * frame holds is the frame's own, byte for byte and alpha included, and
 * nothing past the frame's right and bottom edges differs in sampling
 * phase. Moving the transform by even a whole px rounds its fractional
 * camera and anchor terms apart in Chrome's float matrix, so only the part
 * left of or above the frame, which no unmoved canvas can hold, paints at
 * the transform moved by the box's corner.
 */
const rendererOf = (scene: PaintScene, pictures: Pictures, frame: Surface) => {
  const prepared = prepare(scene, pictures);
  const grown = scratchSurface();
  const analysis = scratchSurface();
  const paintOn = (s: Surface, base: DOMMatrix, p: Prepared, req: PaintRequest) =>
    paintFrame(s.ctx, base, scene, p, pictures, req);
  const analysisOf = (req: PaintRequest, box: Box, p: Prepared): string =>
    Option.match(analysis(box.width, box.height), {
      onNone: () => 'no 2d context for the analysis canvas',
      onSome: (out) => {
        const moved = Option.liftPredicate(box, (b) => b.x < 0 || b.y < 0).pipe(
          Option.flatMap((b) => paintOn(out, new DOMMatrix([1, 0, 0, 1, -b.x, -b.y]), p, req)),
        );
        if (Option.isSome(moved)) return moved.value;
        const unmoved = Option.flatMap(originQuadrantOf(box), (q) =>
          Option.match(grown(q.x + q.width, q.y + q.height), {
            onNone: () => Option.some('no 2d context for the grown canvas'),
            onSome: (g) =>
              Option.match(paintOn(g, new DOMMatrix(), p, req), {
                onSome: (why) => Option.some(why),
                onNone: () => {
                  out.ctx.setTransform(1, 0, 0, 1, 0, 0);
                  out.ctx.globalAlpha = 1;
                  out.ctx.filter = 'none';
                  out.ctx.globalCompositeOperation = 'source-over';
                  out.ctx.imageSmoothingEnabled = false;
                  const at = { x: q.x - box.x, y: q.y - box.y };
                  out.ctx.clearRect(at.x, at.y, q.width, q.height);
                  out.ctx.drawImage(
                    g.canvas,
                    q.x,
                    q.y,
                    q.width,
                    q.height,
                    at.x,
                    at.y,
                    q.width,
                    q.height,
                  );
                  return Option.none();
                },
              }),
          }),
        );
        return Option.getOrElse(unmoved, () => out.canvas.toDataURL('image/png'));
      },
    });
  return (req: PaintRequest, box: Box): string =>
    Option.match(prepared, {
      onNone: () => 'a picture of the scene does not read',
      onSome: (p) => {
        if (box.x !== 0 || box.y !== 0 || box.width !== scene.width || box.height !== scene.height)
          return analysisOf(req, box, p);
        frame.ctx.setTransform(1, 0, 0, 1, 0, 0);
        frame.ctx.clearRect(0, 0, scene.width, scene.height);
        return Option.getOrElse(paintOn(frame, new DOMMatrix(), p, req), () =>
          frame.canvas.toDataURL('image/png'),
        );
      },
    });
};

/** The page's handle: `load` decodes a scene's pictures and leaves `render` for it, answering `loaded` or why not. */
const storybook = {
  load: (scene: PaintScene): Promise<string> | string => {
    const canvas = document.createElement('canvas');
    canvas.width = scene.width;
    canvas.height = scene.height;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no 2d context';
    return Effect.runPromise(
      Effect.forEach(picturesOf(scene), decoded, { concurrency: 8 }).pipe(
        Effect.map((pairs) => {
          Reflect.set(
            storybook,
            'render',
            rendererOf(scene, picturesFrom(new Map(pairs)), { canvas, ctx }),
          );
          return 'loaded';
        }),
      ),
    );
  },
};
Reflect.set(window, 'storybook', storybook);
Reflect.set(window, 'ready', true);
