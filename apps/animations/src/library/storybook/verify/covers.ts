import type { Raster } from '@manna/film/tools';
import { Effect, Option } from 'effect';
import sharp from 'sharp';
import { APP } from '../render.ts';
import { anchorOf, type Box, faceBoxOf } from '../sheet.ts';
import {
  type CameraKey,
  drawnKeyOf,
  drawOrder,
  type FigureFrame,
  type Frame,
  frameAt,
  type Plate,
  plateAt,
  type PlateKey,
  type Shot,
  timesOf,
} from '../shot.ts';
import { drawnCellOf, headsOf, sharesOf, type StoredFigure } from '../store.ts';

/** A plate's picture as a count of its pixels that are not clear above and left of each corner: (width + 1) × (height + 1) sums, so a box's count is four reads. */
export interface Coverage {
  readonly width: number;
  readonly height: number;
  readonly sums: Int32Array;
}

/** A picture's coverage: its summed table of pixels that are not clear. */
const coverageOf = (picture: Raster): Coverage => {
  const w = picture.width + 1;
  const sums = new Int32Array(w * (picture.height + 1));
  for (let y = 0; y < picture.height; y++)
    for (let x = 0; x < picture.width; x++)
      sums[(y + 1) * w + x + 1] =
        Number((picture.rgba[(y * picture.width + x) * 4 + 3] ?? 0) > 0) +
        (sums[y * w + x + 1] ?? 0) +
        (sums[(y + 1) * w + x] ?? 0) -
        (sums[y * w + x] ?? 0);
  return { width: picture.width, height: picture.height, sums };
};

/** A plate's picture decoded with its alpha, as its coverage. */
const plateCoverage = (plate: Plate) =>
  Effect.promise(() =>
    sharp(`${APP}/${plate.file}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ).pipe(
    Effect.map(({ data, info }) =>
      coverageOf({ width: info.width, height: info.height, rgba: new Uint8Array(data) }),
    ),
  );

/** An axis-aligned rectangle in some picture's or layer's px: left, top, right, bottom. */
type Rect = readonly [number, number, number, number];

/**
 * How many of a plate's pixels inside `rect` (in its layer's px) are not
 * clear at time `t`: none while its key is clear, else read where its key
 * moves and stretches it (about its foot, `plateAt`).
 */
const coverAt = (plate: Plate, picture: Coverage, rect: Rect, t: number): number => {
  const k = plateAt(plate, t);
  if (k.alpha <= 0 || k.sx <= 0 || k.sy <= 0) return 0;
  const { x, y, width, height } = plate.place;
  const [fx, fy] = [x + width / 2, y + height];
  const u = (v: number) => fx + (v - k.x - fx) / k.sx;
  const w = (v: number) => fy + (v - k.y - fy) / k.sy;
  return coverIn(plate, picture, [u(rect[0]), w(rect[1]), u(rect[2]), w(rect[3])]);
};

/** How many of a plate's pixels inside `rect` (in its layer's px, the plate at rest) are not clear. */
const coverIn = (plate: Plate, picture: Coverage, rect: Rect): number => {
  const { x, y, width, height } = plate.place;
  const [sx, sy] = [picture.width / width, picture.height / height];
  const x0 = Math.min(picture.width, Math.max(0, Math.floor((rect[0] - x) * sx)));
  const y0 = Math.min(picture.height, Math.max(0, Math.floor((rect[1] - y) * sy)));
  const x1 = Math.max(x0, Math.min(picture.width, Math.ceil((rect[2] - x) * sx)));
  const y1 = Math.max(y0, Math.min(picture.height, Math.ceil((rect[3] - y) * sy)));
  const w = picture.width + 1;
  const at = (u: number, v: number) => picture.sums[v * w + u] ?? 0;
  return at(x1, y1) - at(x0, y1) - at(x1, y0) + at(x0, y0);
};

/**
 * Where a layer at depth `z` lands on screen under `camera`, as the page's
 * multiplane draws it with no drift: its pan from the frame's centre over
 * `z`, its zoom the `z`-th root of the camera's. Answers screen = layer ×
 * scale + offset.
 */
const planeOf = (size: Shot['size'], z: number, camera: CameraKey) => {
  const { width: w, height: h } = size;
  const scale = camera.zoom ** (1 / z);
  const [vx, vy] = [w / 2 + (camera.x - w / 2) / z, h / 2 + (camera.y - h / 2) / z];
  return { scale, ox: w / 2 - vx * scale, oy: h / 2 - vy * scale };
};

/** Every plate the page draws after figure `name` of `shot` (`drawOrder`, then each layer's items in order), so over it, each with its layer's depth and blur. */
const platesOver = (shot: Shot, name: string) => {
  const drawn = drawOrder(shot.layers).flatMap((layer) =>
    layer.items.map((item) => ({ item, z: layer.z, blur: layer.blur })),
  );
  return drawn
    .slice(drawn.findIndex(({ item }) => item._tag === 'Figure' && item.name === name) + 1)
    .flatMap(({ item, z, blur }) => {
      if (item._tag !== 'Plate') return [];
      return [{ plate: item, z, blur }];
    });
};

/** A face box in its own layer's px moved into another layer's px through the screen, grown by `spread` screen px each side. */
const intoLayer = (
  size: Shot['size'],
  face: Rect,
  depths: readonly [number, number],
  camera: CameraKey,
  spread: number,
): Rect => {
  const [a, b] = [planeOf(size, depths[0], camera), planeOf(size, depths[1], camera)];
  const x = (u: number, grow: number) => (u * a.scale + a.ox + grow - b.ox) / b.scale;
  const y = (v: number, grow: number) => (v * a.scale + a.oy + grow - b.oy) / b.scale;
  return [x(face[0], -spread), y(face[1], -spread), x(face[2], spread), y(face[3], spread)];
};

/** Each figure's face box per drawn key it shows, by figure name: its stored cells' and its blinks'. */
const faceBoxesOf = (figures: ReadonlyArray<StoredFigure>) =>
  new Map(
    figures.map(
      (f) =>
        [
          f.figure.name,
          new Map(
            [...f.cells.keys(), ...f.blinks.keys()].map(
              (key) =>
                [key, Option.flatMap(drawnCellOf(f, key), (r) => faceBoxOf(r, f.paints))] as const,
            ),
          ),
        ] as const,
    ),
  );

/** A figure's face box in its layer's px in one frame: its drawn key's face box, placed as the page places the cell (scale, squash and breath about the anchor); none when its cell reads no lines or its drawing no face. */
const faceInLayer = (
  f: FigureFrame,
  stored: StoredFigure,
  boxes: ReadonlyMap<string, Option.Option<Box>>,
): Option.Option<Rect> =>
  Option.flatMap(Option.flatten(Option.fromUndefinedOr(stored.lines.get(f.cell))), (lines) =>
    Option.map(Option.flatten(Option.fromUndefinedOr(boxes.get(drawnKeyOf(f)))), (b): Rect => {
      const { ax, ay } = anchorOf(lines);
      const [kx, ky] = [f.scale * f.sx, f.scale * f.sy * f.breath];
      return [
        f.x + (b.x - ax) * kx,
        f.y + (b.y - ay) * ky,
        f.x + (b.x + b.width - ax) * kx,
        f.y + (b.y + b.height - ay) * ky,
      ];
    }),
  );

/** The coverage of every plate `shot` draws over a figure, by file, each read once into `pictures` (a map shared by several shots reads a plate they share once). */
export const picturesOver = Effect.fnUntraced(function* (
  shot: Shot,
  pictures: Map<string, Coverage> = new Map(),
) {
  for (const layer of shot.layers)
    for (const it of layer.items)
      if (it._tag === 'Figure')
        for (const { plate } of platesOver(shot, it.name))
          if (!pictures.has(plate.file)) pictures.set(plate.file, yield* plateCoverage(plate));
  return pictures;
});

/** What covers the faces of a shot: each fault (a plate at rest over a face, a face that reads none), and each run of frames a moving plate crosses a face, as an INFO line. */
export interface Covers {
  readonly faults: ReadonlyArray<string>;
  readonly moving: ReadonlyArray<string>;
}

/** A face a plate at rest covers in one frame, or a face that reads none. */
interface Fault {
  readonly _tag: 'Fault';
  readonly line: string;
}

/** A face a moving plate crosses in one frame. */
interface Passing {
  readonly _tag: 'Passing';
  readonly figure: string;
  readonly plate: string;
  readonly frame: number;
}

/** One face a plate crosses in one frame: a fault when the plate stands still there, a passing when its key moves. */
type Crossing = Fault | Passing;

const isFault = (c: Crossing): c is Fault => c._tag === 'Fault';
const isPassing = (c: Crossing): c is Passing => c._tag === 'Passing';

/** Whether two plate keys place, stretch and fade a plate alike. */
const sameKey = (a: PlateKey, b: PlateKey): boolean =>
  a.x === b.x && a.y === b.y && a.sx === b.sx && a.sy === b.sy && a.alpha === b.alpha;

/** Whether a plate's key moves at `t`: it differs from its key one frame on. */
const movingAt = (plate: Plate, t: number, fps: number): boolean =>
  !sameKey(plateAt(plate, t), plateAt(plate, t + 1 / fps));

/** Each moving plate's crossings of one face, as INFO lines, one per run of consecutive frames. */
const passingLines = (passings: ReadonlyArray<Passing>): ReadonlyArray<string> =>
  [...Map.groupBy(passings, (p) => `${p.plate} over ${p.figure}`)].flatMap(([what, ps]) =>
    ps
      .reduce<Array<[number, number]>>((runs, p) => {
        const last = runs.at(-1);
        if (last && last[1] === p.frame - 1) last[1] = p.frame;
        else runs.push([p.frame, p.frame]);
        return runs;
      }, [])
      .map(([a, b]) => `INFO cover moving: ${what} frames ${a}–${b}`),
  );

/**
 * What covers each figure's face in every frame of `shot`: a fault per plate
 * drawn over it at rest with any pixel inside the face box (a blurred plate's
 * within three blurs of it), or a fault for a figure whose face reads none.
 * A plate whose key moves in that frame (a prop falling past) only passes,
 * named as an INFO line per run of frames.
 */
export const coversOf = (
  shot: Shot,
  figures: ReadonlyArray<StoredFigure>,
  pictures: ReadonlyMap<string, Coverage>,
): Covers => {
  const byName = new Map(figures.map((f) => [f.figure.name, f] as const));
  const boxes = faceBoxesOf(figures);
  const [heads, shares] = [headsOf(figures), sharesOf(figures)];
  const coversIn = (frame: Frame, index: number, t: number): ReadonlyArray<Crossing> =>
    frame.figures.flatMap((f): ReadonlyArray<Crossing> => {
      const stored = byName.get(f.name);
      const face = Option.flatMap(Option.fromUndefinedOr(stored), (s) =>
        faceInLayer(f, s, boxes.get(f.name) ?? new Map()),
      );
      if (!stored || Option.isNone(face))
        return [{ _tag: 'Fault', line: `${f.name} frame ${index}: no face read` }];
      return platesOver(shot, f.name).flatMap(({ plate, z, blur }): ReadonlyArray<Crossing> => {
        const rect = intoLayer(shot.size, face.value, [stored.layer.z, z], frame.camera, 3 * blur);
        const n = Option.match(Option.fromUndefinedOr(pictures.get(plate.file)), {
          onNone: () => 0,
          onSome: (picture) => coverAt(plate, picture, rect, t),
        });
        if (n === 0) return [];
        if (movingAt(plate, t, shot.fps))
          return [{ _tag: 'Passing', figure: f.name, plate: plate.file, frame: index }];
        return [{ _tag: 'Fault', line: `${f.name} frame ${index}: ${plate.file} covers ${n} px` }];
      });
    });
  const crossings = timesOf(shot).flatMap((t, i) =>
    coversIn(frameAt(shot, heads, t, shares), i, t),
  );
  return {
    faults: crossings.filter(isFault).map((c) => c.line),
    moving: passingLines(crossings.filter(isPassing)),
  };
};
