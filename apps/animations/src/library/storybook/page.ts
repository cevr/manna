import { Effect, Option } from 'effect';
import {
  type PaintRequest,
  type PaintScene,
  type Pictures,
  canvasOf,
  paintFrame,
  prepare,
} from './painter.ts';

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

/** The page's renderer for one scene whose pictures are decoded and prepared: each request painted from itself alone (`paintFrame`), answered as a PNG data URL, or why not. */
const rendererOf = (
  scene: PaintScene,
  pictures: Pictures,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
) => {
  const prepared = prepare(scene, pictures);
  return (req: PaintRequest): string =>
    Option.match(prepared, {
      onNone: () => 'a picture of the scene does not read',
      onSome: (p) => {
        ctx.clearRect(0, 0, scene.width, scene.height);
        return Option.getOrElse(paintFrame(ctx, new DOMMatrix(), scene, p, pictures, req), () =>
          canvas.toDataURL('image/png'),
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
            rendererOf(scene, picturesFrom(new Map(pairs)), canvas, ctx),
          );
          return 'loaded';
        }),
      ),
    );
  },
};
Reflect.set(window, 'storybook', storybook);
Reflect.set(window, 'ready', true);
