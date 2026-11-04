import { multiplane } from '@manna/film/canvas';
import { Effect } from 'effect';

/** One stored cell as the page draws it: its lit pixels as a PNG data URL and its soles' centre in its own px. */
export interface PageCell {
  readonly image: string;
  readonly ax: number;
  readonly ay: number;
}

/** One item of a layer as the page draws it: a plate in its place, or a figure by name with its lit cells by key. */
export type PageItem =
  | {
      readonly _tag: 'Plate';
      readonly image: string;
      readonly place: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
      };
    }
  | {
      readonly _tag: 'Figure';
      readonly name: string;
      readonly cells: Readonly<Record<string, PageCell>>;
    };

/** A shot as the page holds it: the frame's size, the paper behind everything, and each layer's depth, blur and items in drawing order. */
export interface PageScene {
  readonly width: number;
  readonly height: number;
  readonly paper: string;
  readonly layers: ReadonlyArray<{
    readonly name: string;
    readonly z: number;
    readonly blur: number;
    readonly items: ReadonlyArray<PageItem>;
  }>;
}

/** One figure of a frame: its cell, its soles' centre in its layer's px, its stretch across and up (squash, and breath up) and its scale. */
export interface PageFigure {
  readonly name: string;
  readonly cell: string;
  readonly x: number;
  readonly y: number;
  readonly sx: number;
  readonly sy: number;
  readonly scale: number;
}

/**
 * One render: the frame's camera and figures (`frameAt`'s, as plain data),
 * and what to draw: `colour` the whole frame on its paper, or
 * `figure:<name>` that figure's item alone, through its plane at the frame's
 * camera, on transparent and with no fibre.
 */
export interface PageRequest {
  readonly camera: { readonly x: number; readonly y: number; readonly zoom: number };
  readonly figures: ReadonlyArray<PageFigure>;
  readonly output: string;
}

/** The shot's depth settings: its camera authored, so no drift; the engine's default fibre on the backdrop of the whole frame, none on a figure alone. */
const DEPTHS = [{ drift: 0 }, { drift: 0, fibre: 0 }] as const;

/** Every picture a scene names, by its data URL. */
const picturesOf = (scene: PageScene): ReadonlyArray<string> =>
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

/** The cells a scene's figures hold, by `<figure>/<key>`. */
const cellsOf = (scene: PageScene): ReadonlyMap<string, PageCell> =>
  new Map(
    scene.layers.flatMap((l) =>
      l.items.flatMap((i) => {
        if (i._tag === 'Plate') return [];
        return Object.entries(i.cells).map(([key, cell]) => [`${i.name}/${key}`, cell] as const);
      }),
    ),
  );

/** The page's renderer for one scene whose pictures are all decoded: each request drawn from itself alone, answered as a PNG data URL, or why not. */
const rendererOf = (
  scene: PageScene,
  pictures: ReadonlyMap<string, HTMLImageElement>,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
) => {
  const cells = cellsOf(scene);
  const draw = (url: string, x: number, y: number, w: number, h: number) => {
    const image = pictures.get(url);
    if (image) ctx.drawImage(image, x, y, w, h);
  };
  const drawFigure = (f: PageFigure) => {
    const cell = cells.get(`${f.name}/${f.cell}`);
    if (!cell) return;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(f.scale * f.sx, f.scale * f.sy);
    const image = pictures.get(cell.image);
    if (image) ctx.drawImage(image, -cell.ax, -cell.ay);
    ctx.restore();
  };
  const drawItem = (item: PageItem, figures: ReadonlyMap<string, PageFigure>, only: string) => {
    if (item._tag === 'Plate') {
      if (only === '')
        draw(item.image, item.place.x, item.place.y, item.place.width, item.place.height);
      return;
    }
    const f = figures.get(item.name);
    if (f && (only === '' || only === item.name)) drawFigure(f);
  };

  return (req: PageRequest): string => {
    const missing = req.figures.filter((f) => !cells.has(`${f.name}/${f.cell}`));
    if (missing.length > 0)
      return `no cell ${missing.map((f) => `${f.name}/${f.cell}`).join(', ')}`;
    const figures = new Map(req.figures.map((f) => [f.name, f] as const));
    const only = req.output.replace(/^figure:/, '').replace(/^colour$/, '');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, scene.width, scene.height);
    if (only === '') {
      ctx.fillStyle = scene.paper;
      ctx.fillRect(0, 0, scene.width, scene.height);
    }
    const layers = scene.layers.filter(
      (l) => only === '' || l.items.some((i) => i._tag === 'Figure' && i.name === only),
    );
    multiplane(
      ctx,
      req.camera,
      scene.width,
      scene.height,
      layers.map((layer) => ({
        z: layer.z,
        draw: () => {
          if (layer.blur > 0) ctx.filter = `blur(${layer.blur}px)`;
          for (const item of layer.items) drawItem(item, figures, only);
          ctx.filter = 'none';
        },
      })),
      DEPTHS[Number(only !== '')],
    );
    return canvas.toDataURL('image/png');
  };
};

/** The page's handle: `load` decodes a scene's pictures and leaves `render` for it, answering `loaded` or why not. */
const storybook = {
  load: (scene: PageScene): Promise<string> | string => {
    const canvas = document.createElement('canvas');
    canvas.width = scene.width;
    canvas.height = scene.height;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no 2d context';
    return Effect.runPromise(
      Effect.forEach(picturesOf(scene), decoded, { concurrency: 8 }).pipe(
        Effect.map((pairs) => {
          Reflect.set(storybook, 'render', rendererOf(scene, new Map(pairs), canvas, ctx));
          return 'loaded';
        }),
      ),
    );
  },
};
Reflect.set(window, 'storybook', storybook);
Reflect.set(window, 'ready', true);
