import { Effect, Option } from 'effect';
import {
  type PaintRequest,
  type PaintScene,
  type Pictures,
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
      return Object.values(i.cells).map((c) => c.image);
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

/** A canvas `box.width` × `box.height` for an analysis render, made once and resized as boxes change; none without a 2d context. */
const analysisSurface = () => {
  const canvas = document.createElement('canvas');
  const ctx = Option.fromNullishOr(canvas.getContext('2d'));
  return (box: Box): Option.Option<Surface> =>
    Option.map(ctx, (c) => {
      if (canvas.width !== box.width) canvas.width = box.width;
      if (canvas.height !== box.height) canvas.height = box.height;
      return { canvas, ctx: c };
    });
};

/**
 * The page's renderer for one scene whose pictures are decoded and
 * prepared: each request painted from itself alone (`paintFrame`) over
 * `box`, answered as a PNG data URL, or why not. The whole frame paints on
 * the frame's canvas at the frame's own transform; any other box paints on
 * an analysis canvas of its size, at that transform moved by the box's
 * corner (whole px), so a figure reaching past the frame is painted whole
 * and every pixel inside the frame is the one the frame paints.
 */
const rendererOf = (scene: PaintScene, pictures: Pictures, frame: Surface) => {
  const prepared = prepare(scene, pictures);
  const analysis = analysisSurface();
  const surfaceOf = (box: Box): Option.Option<Surface> => {
    if (box.x === 0 && box.y === 0 && box.width === scene.width && box.height === scene.height)
      return Option.some(frame);
    return analysis(box);
  };
  return (req: PaintRequest, box: Box): string =>
    Option.match(prepared, {
      onNone: () => 'a picture of the scene does not read',
      onSome: (p) =>
        Option.match(surfaceOf(box), {
          onNone: () => 'no 2d context for the analysis canvas',
          onSome: ({ canvas, ctx }) => {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const base = new DOMMatrix([1, 0, 0, 1, -box.x, -box.y]);
            return Option.getOrElse(paintFrame(ctx, base, scene, p, pictures, req), () =>
              canvas.toDataURL('image/png'),
            );
          },
        }),
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
