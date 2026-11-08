import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Layer, Option } from 'effect';
import sharp from 'sharp';
import { filmCast, filmFolder, shotsOf } from '../../../library/storybook/films.ts';
import type { PaintScene } from '../../../library/storybook/painter.ts';
import { APP, dataUrlOf, loadShot } from '../../../library/storybook/render.ts';
import { filmSceneOf, type SheetDecl, storyPaintings } from '../../../library/storybook/scene.ts';
import {
  anchorOf,
  faceBoxOf,
  paintsOf,
  strayShadeShare,
} from '../../../library/storybook/sheet.ts';
import {
  drawnKeyOf,
  type Figure,
  frameAt,
  type Plate,
  plateAt,
  revealAt,
  type Shot,
  timesOf,
} from '../../../library/storybook/shot.ts';
import {
  cellsMisses,
  drawnCellOf,
  headsOf,
  loadFigures,
  readRecord,
  sharesOf,
  sheetDir,
  type StoredFigure,
} from '../../../library/storybook/store.ts';
import { type Coverage, coversOf, picturesOver } from '../../../library/storybook/verify/covers.ts';
import { SHEET_CELLS } from './cells.ts';
import { inItsOrder } from './index.ts';

/** The coverage of a picture of one opaque pixel: a probe plate's. */
const OPAQUE: Coverage = { width: 1, height: 1, sums: new Int32Array([0, 0, 0, 1]) };

/**
 * Whether `coversOf` faults a still 2×2 opaque plate laid inside each
 * figure's lower face at the shot's first frame, by figure name: the plate
 * placed where the page paints that face (`frameAt` with the figures' head
 * shares), on the figure's own layer after it; none for a figure whose face
 * reads none.
 */
const lowerFaceProbes = (shot: Shot, figures: ReadonlyArray<StoredFigure>) => {
  const frame = frameAt(shot, headsOf(figures), 0, sharesOf(figures));
  return figures.flatMap((stored) => {
    const f = frame.figures.find((g) => g.name === stored.figure.name);
    if (!f) return [];
    const placed = Option.all([
      Option.flatten(Option.fromUndefinedOr(stored.lines.get(f.cell))),
      Option.flatMap(drawnCellOf(stored, f.cell), (cell) => faceBoxOf(cell, stored.paints)),
    ]);
    return Option.toArray(
      Option.map(placed, ([lines, face]) => {
        const { ax, ay } = anchorOf(lines);
        const x = f.x + (face.x + face.width / 2 - ax) * f.scale * f.sx;
        const y = f.y + (face.y + face.height * 0.75 - ay) * f.scale * f.sy * f.breath;
        const plate: Plate = {
          _tag: 'Plate',
          file: 'probe',
          testArt: true,
          place: { x: x - 1, y: y - 1, width: 2, height: 2 },
        };
        const layer = { ...stored.layer, items: [stored.figure, plate] };
        const probe: Shot = { ...shot, from: 0, duration: 1 / shot.fps, layers: [layer] };
        const faulted = coversOf(probe, [{ ...stored, layer }], new Map([['probe', OPAQUE]]));
        return [stored.figure.name, faulted.faults.length > 0] as const;
      }),
    );
  });
};

/** What covers a face in each named shot of the film, by shot id (`coversOf`: its first five faults, then its moving plates' INFO lines, then whether a still plate laid inside each figure's lower face is faulted, `lowerFaceProbes`): each shot's figures as stored, and every plate drawn over one. */
export const faceCovers = (ids: ReadonlyArray<string>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const cast = yield* filmCast(inItsOrder);
      const placed = yield* shotsOf(inItsOrder);
      const read = new Map<string, Coverage>();
      return yield* Effect.forEach(
        placed.filter(({ shot }) => ids.includes(shot.id)),
        ({ shot }) =>
          Effect.gen(function* () {
            const figures = yield* loadFigures(cast, shot);
            const pictures = yield* picturesOver(shot, read);
            const covers = coversOf(shot, figures, pictures);
            return [
              shot.id,
              covers.faults.slice(0, 5),
              covers.moving,
              lowerFaceProbes(shot, figures),
            ] as const;
          }),
      );
    }).pipe(Effect.provide([filmFolder.pipe(Layer.provide(BunServices.layer)), BunServices.layer])),
  );

/** A picture file's real path and its pixel size, read off its PNG header. */
const pictureOf = Effect.fn('Act1Testing.pictureOf')(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  const bytes = yield* fs.readFile(file);
  const header = new DataView(bytes.buffer, bytes.byteOffset + 16, 8);
  const size: readonly [number, number] = [header.getUint32(0), header.getUint32(4)];
  return { file: yield* fs.realPath(file), size };
});

/** What a painted shot reads, comparable path to path: its size, paper and light, then per layer each plate's picture file, size, place, moves and reveal, and each figure's head share, worn heads, blinks, dress and each cell's picture file, size, anchor (`ax`, `ay`) and head. */
const resourcesOf = (scene: PaintScene, files: ReadonlyMap<string, string>) => ({
  size: [scene.width, scene.height],
  paper: scene.paper,
  light: scene.light,
  layers: scene.layers.map((layer) => ({
    name: layer.name,
    z: layer.z,
    blur: layer.blur,
    items: layer.items.map((item) => {
      if (item._tag === 'Plate')
        return {
          plate: files.get(item.image) ?? `unread ${item.image.slice(0, 64)}`,
          size: item.size,
          place: item.place,
          moves: item.moves,
          reveal: item.reveal ?? 'none',
        };
      return {
        figure: item.name,
        share: item.share,
        worn: item.worn,
        blinks: item.blinks,
        dress: item.dress,
        cells: Object.entries(item.cells).map(([key, c]) => ({
          key,
          file: files.get(c.image) ?? `unread ${c.image.slice(0, 64)}`,
          size: c.size,
          ax: c.ax,
          ay: c.ay,
          head: c.head ?? 'none',
        })),
      };
    }),
  })),
});

/** The film's storybook shots in the four groups the resource check reads, one unit-test task each (each task under its 1 s budget). */
export const RESOURCE_GROUPS = [
  ['cold-baby', 'cold-table'],
  ['cold-letter', 'cold-ouch'],
  ['cold-what', 'title'],
  ['milk-cup', 'milk-pour', 'milk-row'],
] as const;

/**
 * Each named storybook shot of the film as the film paints it and as the
 * verify paints it, reduced to what each reads (`resourcesOf`): the film's
 * from its declared sheets (`SHEET_CELLS`) and each picture's painting in
 * its scene's drawing (`storyPaintings`), the verify's the very scene its
 * loader gives its page (`loadShot`: each cell's anchor and head read off
 * the stored cell), each picture known by the file whose bytes it holds.
 */
export const shotResources = (ids: ReadonlyArray<string>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const cast = yield* filmCast(inItsOrder);
      const placed = (yield* shotsOf(inItsOrder)).filter(({ shot }) => ids.includes(shot.id));
      const films = new Map(
        inItsOrder.stories.flatMap((story) =>
          story.shots.map(
            (s) => [s.id, storyPaintings(story, SHEET_CELLS, inItsOrder.grid)] as const,
          ),
        ),
      );
      return yield* Effect.forEach(placed, ({ shot }) =>
        Effect.gen(function* () {
          const film = filmSceneOf(shot, SHEET_CELLS);
          const paintings = films.get(shot.id) ?? {};
          const filmFiles = new Map(
            yield* Effect.forEach(
              film.layers.flatMap((l) =>
                l.items.flatMap((item) => {
                  if (item._tag === 'Plate') return [item.image];
                  return Object.values(item.cells).map((c) => c.image);
                }),
              ),
              (image) =>
                Effect.map(
                  pictureOf(paintings[image]?.png ?? `${import.meta.dir}/unpainted`),
                  (p) => [image, p.file] as const,
                ),
            ),
          );
          const { scene: verify } = yield* loadShot(shot, cast);
          const read = [
            ...figuresAndPlates(shot).plates.map((p) => `${APP}/${p.file}`),
            ...(yield* Effect.forEach(figuresAndPlates(shot).figures, (f) =>
              Effect.map(readRecord(cast, f.member, f.sheet), (record) =>
                record.cells.map((c) => `${sheetDir(cast, f.member, f.sheet)}/cells/${c.key}.png`),
              ),
            )).flat(),
          ];
          const verifyFiles = new Map(
            yield* Effect.forEach(read, (file) =>
              Effect.gen(function* () {
                const fs = yield* FileSystem.FileSystem;
                return [dataUrlOf(yield* fs.readFile(file)), yield* fs.realPath(file)] as const;
              }),
            ),
          );
          return [shot.id, resourcesOf(film, filmFiles), resourcesOf(verify, verifyFiles)] as const;
        }),
      );
    }).pipe(Effect.provide([filmFolder.pipe(Layer.provide(BunServices.layer)), BunServices.layer])),
  );

/** How much of a plate is shown at `t`: its key's alpha, times the brush points its reveal has drawn when it has one. */
const shownOf = (plate: Plate, t: number): number =>
  plateAt(plate, t).alpha *
  Option.match(Option.fromUndefinedOr(plate.reveal), {
    onNone: () => 1,
    onSome: (reveal) => revealAt(reveal, t).length,
  });

/**
 * The frames of a shot that together show every picture it paints, each at
 * its fullest: each plate at the first frame it is most shown (`shownOf`),
 * then the frame showing the most figure keys not yet shown (each figure's
 * drawn key, a blink included), until every key is. Indices into
 * `timesOf(shot)`, in order.
 */
export const stateFrames = (shot: Shot): ReadonlyArray<number> => {
  const times = timesOf(shot);
  const unshared = new Map<string, number>();
  const keys = times.map(
    (t) =>
      new Set(
        frameAt(shot, unshared, t, unshared).figures.map((f) => `${f.name} ${drawnKeyOf(f)}`),
      ),
  );
  const chosen = new Set(
    figuresAndPlates(shot).plates.flatMap((p) => {
      const shown = times.map((t) => shownOf(p, t));
      const most = Math.max(...shown);
      if (most <= 0) return [];
      return [shown.indexOf(most)];
    }),
  );
  const left = new Set(keys.flatMap((k) => [...k]));
  const take = (i: number) => {
    chosen.add(i);
    for (const k of keys[i] ?? []) left.delete(k);
  };
  for (const i of chosen) take(i);
  while (left.size > 0) {
    let [best, most] = [0, 0];
    keys.forEach((k, i) => {
      const n = [...k].filter((x) => left.has(x)).length;
      if (n > most) [best, most] = [i, n];
    });
    take(best);
  }
  return [...chosen].toSorted((a, b) => a - b);
};

/** A shot's plates and figures, each once, in drawing order. */
const figuresAndPlates = (shot: Shot) => {
  const items = shot.layers.flatMap((l) => l.items);
  return {
    plates: items.filter((item): item is Plate => item._tag === 'Plate'),
    figures: items.filter((item): item is Figure => item._tag === 'Figure'),
  };
};

/** Where a sheet lies: the film's own roles first, then the library's (`castFolder`'s order). */
const dirOf = Effect.fn('Act1Testing.dirOf')(function* (member: string, id: string) {
  const fs = yield* FileSystem.FileSystem;
  const own = `${import.meta.dir}/../cast/${member}/shot-sheets/${id}`;
  const library = `${import.meta.dir}/../../../library/cast/${member}/shot-sheets/${id}`;
  return [library, own][Number(yield* fs.exists(own))] ?? own;
});

/** Every way the declared sheets' cells modules differ from their declarations and records: a sheet with no cells, keys out of the declared order, and each `cellsMisses`. */
export const sheetsMisses = Effect.fn('Act1Testing.sheetsMisses')(function* (
  decls: ReadonlyArray<SheetDecl>,
) {
  const misses = yield* Effect.forEach(decls, (decl) =>
    Effect.gen(function* () {
      const name = `${decl.member}/${decl.id}`;
      const sheet = SHEET_CELLS.get(name);
      if (!sheet) return [`${name} has no cells`];
      const keys = Object.keys(sheet.cells).join();
      return [
        ...[`${name} declares ${decl.keys.join()}, draws ${keys}`].filter(
          () => decl.keys.join() !== keys,
        ),
        ...(yield* cellsMisses(
          yield* dirOf(decl.member, decl.id),
          paintsOf(sheet.palette),
          sheet.cells,
        )),
      ];
    }),
  );
  return misses.flat();
});

/** The most of a cell's opaque pixels that may be a stray hair shade (critique 1, item 16; take 5's lead reads 1.25 %, so the bar holds this film's sheets). */
const STRAY_MAX = 0.005;

/** The lead's sheets, by their `<member>/` prefix: `strays-lead.test.ts` walks them and `strays.test.ts` the rest, each its own unit-test task, so each walk stays under its 1 s budget (verifier r2, M4). */
export const LEAD_SHEETS = 'lead-feast/';

/** A cell's pixels as the split stored them. */
const rasterOf = (png: string) =>
  Effect.map(
    Effect.promise(() => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })),
    ({ data, info }) => ({ width: info.width, height: info.height, rgba: new Uint8Array(data) }),
  );

/** How many cells of the act's sheets `keep` admits (by `<member>/<sheet>`), and each whose stray hair shade is over `STRAY_MAX` of its opaque pixels, with its share. */
export const straysOver = (keep: (sheet: string) => boolean) =>
  Effect.gen(function* () {
    const cells = [...SHEET_CELLS]
      .filter(([sheet]) => keep(sheet))
      .flatMap(([sheet, s]) =>
        Object.entries(s.cells).map(([cell, c]) => ({
          at: `${sheet} ${cell}`,
          png: c.png,
          paints: paintsOf(s.palette),
        })),
      );
    const over = yield* Effect.forEach(cells, (c) =>
      Effect.map(rasterOf(c.png), (r) => {
        const share = strayShadeShare(r, c.paints);
        if (share <= STRAY_MAX) return [];
        return [`${c.at}: ${(share * 100).toFixed(2)} %`];
      }),
    );
    return { cells: cells.length, over: over.flat() };
  });
