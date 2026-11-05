import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { type Raster, decodePng, encodePng } from '@manna/film/tools';
import { Console, Effect, FileSystem } from 'effect';

/** How near (px, in the square round it) a clear pixel lies to an opaque one for it to sit on a plate's edge. */
const EDGE_PX = 2;

/** How near (px, in the square round it) a clear pixel lies to an opaque one for `unfringe` to repaint it on the close table plate: its keyed lime reaches 4 px in from the edge. */
export const CLOSE_EDGE_PX = 4;

/** How far (px, in the square round it) `unfringed` looks for a pixel to repaint a lime one from. */
const REACH_PX = 12;

/** Whether pixel `q` of `r` is lime: its green above its red by more than 25 and above its blue by more than 40, the flat green ground a plate is keyed from. */
const isLime = (r: Raster, q: number): boolean => {
  const [red, green, blue] = [r.rgba[q * 4] ?? 0, r.rgba[q * 4 + 1] ?? 0, r.rgba[q * 4 + 2] ?? 0];
  return green - red > 25 && green - blue > 40;
};

/** Whether pixel `q` of `r` is opaque and lies within `band` px of a clear pixel. */
const onEdge = (r: Raster, q: number, band: number): boolean => {
  if ((r.rgba[q * 4 + 3] ?? 0) === 0) return false;
  const [x, y] = [q % r.width, Math.floor(q / r.width)];
  for (let v = Math.max(0, y - band); v <= Math.min(r.height - 1, y + band); v++)
    for (let u = Math.max(0, x - band); u <= Math.min(r.width - 1, x + band); u++)
      if ((r.rgba[(v * r.width + u) * 4 + 3] ?? 0) === 0) return true;
  return false;
};

/** The lime pixels on a plate's edge (`onEdge` within `band` px, `EDGE_PX` by default; `isLime`): its keyed ground's fringe. */
export const limeEdgeOf = (r: Raster, band = EDGE_PX): ReadonlyArray<number> =>
  Array.from({ length: r.width * r.height }, (_, q) => q).filter(
    (q) => isLime(r, q) && onEdge(r, q, band),
  );

/** The nearest wholly opaque pixel of `r` to `q` that is not lime, within `REACH_PX`, so a faint rim pixel's stray colour is never copied; `q` itself when none is. */
const nearestUnlime = (r: Raster, q: number): number => {
  const [x, y] = [q % r.width, Math.floor(q / r.width)];
  let best = { at: q, distance: Number.POSITIVE_INFINITY };
  for (let v = Math.max(0, y - REACH_PX); v <= Math.min(r.height - 1, y + REACH_PX); v++)
    for (let u = Math.max(0, x - REACH_PX); u <= Math.min(r.width - 1, x + REACH_PX); u++) {
      const p = v * r.width + u;
      const distance = (u - x) ** 2 + (v - y) ** 2;
      if ((r.rgba[p * 4 + 3] ?? 0) < 255 || isLime(r, p) || distance >= best.distance) continue;
      best = { at: p, distance };
    }
  return best.at;
};

/** The plate with each lime pixel within `band` px of its edge (`limeEdgeOf`) repainted in the colour of its nearest wholly opaque pixel that is not lime, its alpha kept. */
export const unfringed = (r: Raster, band = EDGE_PX): Raster => {
  const rgba = r.rgba.slice();
  for (const q of limeEdgeOf(r, band)) {
    const from = nearestUnlime(r, q);
    rgba.set(r.rgba.subarray(from * 4, from * 4 + 3), q * 4);
  }
  return { width: r.width, height: r.height, rgba };
};

/** The plates `unfringe` repaints, each with the band (px from its edge) it repaints: the close table, keyed from a flat green ground. */
const FRINGED = [['table-close.png', CLOSE_EDGE_PX]] as const;

const unfringe = Effect.forEach(FRINGED, ([file, band]) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = `${import.meta.dir}/${file}`;
    const plate = yield* Effect.fromResult(decodePng(yield* fs.readFile(path)));
    const lime = limeEdgeOf(plate, band).length;
    if (lime > 0) yield* fs.writeFile(path, encodePng(unfringed(plate, band)));
    yield* Console.log(`  ${file}: repainted ${lime} lime edge px`);
  }),
);

if (import.meta.main) unfringe.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
