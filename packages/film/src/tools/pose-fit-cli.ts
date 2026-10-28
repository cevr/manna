// `film concept fit <film> <member> --view <kind>-<view> --from <view> ...
// [--bone <name> ...]`: a kept view's pose fitted from the member's cut-out
// puppets (`core/pose-fit.ts`). The view is the kept sheet cropped at its
// box (the film's `rigs/cast.ts`, its `CUTOUT` view else its `CAST` view);
// each `--from` puppet (a view his `CUTOUT` table draws) is started where
// its rest figure fills the view's figure box (`boxStart`) and searched over
// its root, its one scale and the bones named (none unless named: a turned
// lean, neck or head moves the parts on it apart at the collar, and the L3
// line then rings every part it moves), in the view's crop's frame, no bone
// turned past 15° (a bigger move is a drawn key). The puppet with the lower
// loss is the fit; every puppet's loss is kept beside it. The record is written to the
// member's `cutout/poses/<kind>-<view>.json`, which his poses module reads.

import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import {
  Array as Arr,
  Clock,
  Console,
  Effect,
  FileSystem,
  Option,
  Order,
  Path,
  Predicate,
  Result,
  Schema,
} from 'effect';
import type { CastModule } from '../canvas/cast.ts';
import { boxStart, fitPose } from '../core/pose-fit.ts';
import { cropRaster } from '../core/raster.ts';
import { PuppetImagesBun } from '../puppet/images-bun.ts';
import { puppetFrom } from '../puppet/load.ts';
import { castFolder } from './cast-library.ts';
import { FilmFolder, filmNamed, importFilmModule } from './film-repo.ts';
import { decodePng } from './png.ts';

/** A fit that cannot be made: an unknown view or puppet, a table or sheet that does not load. */
export class FitRefused extends Schema.TaggedError<FitRefused>()('FitRefused', {
  member: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.member}'s fit: ${this.reason}`;
  }
}

/** How far a fit turns a bone, degrees: the most a mesh bends; a bigger move is a drawn key. */
const REACH = 15;

const isCastModule = (u: unknown): u is CastModule =>
  Predicate.hasProperty(u, 'CAST') && Predicate.hasProperty(u, 'SHEETS');

const jsonOf = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** Six places after the point: a fit's numbers as the record keeps them. */
const kept = (v: number) => Math.round(v * 1e6) / 1e6;

export const fit = Command.make(
  'fit',
  {
    film: Argument.String('film').pipe(
      Argument.withDescription('the film whose rigs/cast.ts draws the member'),
    ),
    member: Argument.String('member').pipe(Argument.withDescription('the cast member, by its id')),
    view: Flag.String('view').pipe(
      Flag.withDescription('the kept view fitted, <kind>-<view> (poses-poses-1)'),
    ),
    from: Flag.String('from').pipe(
      Flag.atLeast(1),
      Flag.withDescription('a cut-out view whose puppet is fitted (front); the lower loss is kept'),
    ),
    bone: Flag.String('bone').pipe(
      Flag.atLeast(0),
      Flag.withDescription('a bone the fit turns (none unless named: the root and scale alone)'),
    ),
  },
  Effect.fn('film.concept.fit')(function* (input) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const refuse = (reason: string) => FitRefused.make({ member: input.member, reason });
    const film = yield* filmNamed(input.film);
    const file = path.join((yield* FilmFolder).paths(film).dir, 'rigs', 'cast.ts');
    const table: unknown = yield* Effect.tryPromise({
      try: () => importFilmModule(file),
      catch: (e) => refuse(`${file} does not load: ${String(e)}`),
    });
    if (!isCastModule(table)) return yield* refuse(`${file} exports no cast table`);
    const dash = input.view.indexOf('-');
    const [kind, name] = [input.view.slice(0, dash), input.view.slice(dash + 1)];
    const target = Option.fromUndefinedOr(
      table.CUTOUT?.[input.member]?.[kind]?.[name] ?? table.CAST[input.member]?.[kind]?.[name],
    );
    if (Option.isNone(target)) return yield* refuse(`no ${input.view} in CUTOUT or CAST`);
    const folder = yield* castFolder(film, input.member);
    const sheet = yield* Effect.fromResult(
      Result.mapError(
        decodePng(yield* fs.readFile(path.join(folder, 'kept', `${kind}.png`))),
        (e) => refuse(e.message),
      ),
    );
    const crop = cropRaster(sheet, target.value.box);
    const views = Object.values(table.CUTOUT?.[input.member] ?? {}).flatMap((k) =>
      Object.entries(k),
    );
    const fits = yield* Effect.forEach(input.from, (from) =>
      Effect.gen(function* () {
        const spec = yield* Effect.fromOption(
          Arr.findFirst(views, ([n]) => n === from).pipe(Option.map(([, v]) => v.puppet)),
        ).pipe(Effect.mapError(() => refuse(`CUTOUT has no view ${from} to fit from`)));
        const puppet = yield* puppetFrom(spec).pipe(Effect.mapError((e) => refuse(e.message)));
        const bones = input.bone;
        const unknown = bones.filter((b) => !puppet.bones.some((x) => x.name === b));
        if (unknown.length > 0)
          return yield* refuse(`${from}'s puppet has no bone ${unknown.join(', ')}`);
        const t0 = yield* Clock.currentTimeMillis;
        const start = boxStart(puppet, crop);
        const made = fitPose(puppet, crop, { bones, start, reach: REACH });
        const ms = (yield* Clock.currentTimeMillis) - t0;
        yield* Console.log(
          `fit ${input.member} ${input.view} from=${from} loss=${made.loss.toFixed(3)} rasters=${made.rasters} ms=${ms} scale=${made.scale.toFixed(4)} ${bones.map((b) => `${b}=${(made.numbers[b] ?? 0).toFixed(3)}`).join(' ')}`,
        );
        return { from, made, ms, bones };
      }),
    );
    const byLoss = Order.mapInput(Order.Number, (f: (typeof fits)[number]) => f.made.loss);
    const best = yield* Effect.fromOption(Arr.head(Arr.sort(fits, byLoss))).pipe(
      Effect.mapError(() => refuse('no puppet to fit from')),
    );
    const record = {
      view: input.view,
      box: target.value.box,
      from: best.from,
      bones: best.bones,
      pose: {
        numbers: Object.fromEntries(best.bones.map((b) => [b, kept(best.made.numbers[b] ?? 0)])),
        root: [kept(best.made.root[0]), kept(best.made.root[1])],
        scale: kept(best.made.scale),
      },
      scores: Object.fromEntries(fits.map((f) => [f.from, kept(f.made.loss)])),
      ms: fits.reduce((s, f) => s + f.ms, 0),
      rasters: best.made.rasters,
    };
    const dir = path.join(path.dirname(folder), 'cutout', 'poses');
    yield* fs.makeDirectory(dir, { recursive: true });
    const out = path.join(dir, `${input.view}.json`);
    yield* fs.writeFileString(out, `${jsonOf(record)}\n`);
    yield* Console.log(`fit ${input.member} ${input.view} from=${best.from} ${out}`);
  }),
).pipe(
  Command.withDescription(
    "Fit a kept view's pose from the member's cut-out puppets: each puppet's root, one scale and any bones named searched against the kept crop by coordinate descent on its CPU raster; the lower loss is kept, every loss beside it, in the member's cutout/poses/<kind>-<view>.json",
  ),
  Command.provide(PuppetImagesBun),
);
