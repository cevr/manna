import { decodePng, encodePng, ImageRoute, type Raster } from '@manna/film/tools';
import { DateTime, Effect, FileSystem, Option, Path, Schema } from 'effect';
import {
  deltaE,
  figuresIn,
  clearBackground,
  groundOf,
  hexOf,
  type Palette,
  PaletteJson,
  paintsOf,
  rgbOfHex,
  rgbSum,
  splitSheet,
  type Split,
} from './sheet.ts';

/** The shared cast, where each member's palette, kept views and shot sheets live. */
export const CAST = `${import.meta.dir}/../cast`;

/** The size every shot sheet is drawn at: a wide row of figures. */
export const SHEET_SIZE = '1536x1024';

/** A name in a path: a member, a sheet id, a key or a view. */
const Name = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9-]*$/, { message: 'a plain name: letters, digits, -' }),
);

const BoxJson = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  width: Schema.Finite,
  height: Schema.Finite,
});

/** A shot sheet's record, `cast/<member>/shot-sheets/<id>/record.json`: what was asked, from which refs, what came back, and each cell. */
export const SheetRecord = Schema.Struct({
  member: Name,
  id: Name,
  prompt: Schema.String,
  /** Each reference image, relative to the member's folder, and its sha256 when drawn. */
  refs: Schema.Array(Schema.Struct({ file: Schema.String, sha256: Schema.String })),
  /** The sha256 of `sheet.png`, as drawn. */
  sheet: Schema.String,
  size: Schema.String,
  /** The ground the split measured on the drawn sheet, `#rrggbb`. */
  ground: Schema.String,
  /** The day it was drawn, `YYYY-MM-DD`. */
  drawn: Schema.String,
  cells: Schema.Array(Schema.Struct({ key: Name, box: BoxJson, sha256: Schema.String })),
  /** The owner's keep: absent until he keeps the sheet. */
  kept: Schema.optionalKey(
    Schema.Struct({ date: Schema.String, why: Schema.String, ask: Schema.String }),
  ),
});

export type SheetRecord = typeof SheetRecord.Type;

export const RecordJson = Schema.fromJsonString(SheetRecord, { space: 2 });

/** `cells.json`: the split sheet's sha256 and each cell's box, left to right. */
export const CellsJson = Schema.fromJsonString(
  Schema.Struct({ sheet: Schema.String, cells: Schema.Array(BoxJson) }),
  { space: 2 },
);

/** A file the store could not read or write, and why. */
export class StoreFailed extends Schema.TaggedError<StoreFailed>()('StoreFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

/** A draw that cannot become a sheet: the record is not written, and the agent draws again. */
export class DrawRefused extends Schema.TaggedError<DrawRefused>()('DrawRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return `the draw is refused: ${this.reason}`;
  }
}

export const sha256 = (bytes: Uint8Array): string =>
  new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

/** Where a member's shot sheet lives. */
export const sheetDir = (cast: string, member: string, id: string): string =>
  `${cast}/${member}/shot-sheets/${id}`;

/** `bytes` as a PNG's pixels, or why not, naming `file`. */
export const pngOf = (bytes: Uint8Array, file: string) =>
  Effect.fromResult(decodePng(bytes)).pipe(
    Effect.mapError((e) => StoreFailed.make({ reason: `${file}: ${e.message}` })),
  );

/** A palette file's paints. */
export const readPalette = Effect.fn('Storybook.readPalette')(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  return yield* Schema.decodeEffect(PaletteJson)(yield* fs.readFileString(file));
});

/** A member's palette, `cast/<member>/cast-sheet/palette.json`. */
export const memberPalette = (cast: string, member: string) =>
  readPalette(`${cast}/${member}/cast-sheet/palette.json`);

/** A member's shot sheet record. */
export const readRecord = Effect.fn('Storybook.readRecord')(function* (
  cast: string,
  member: string,
  id: string,
) {
  const fs = yield* FileSystem.FileSystem;
  return yield* Schema.decodeEffect(RecordJson)(
    yield* fs.readFileString(`${sheetDir(cast, member, id)}/record.json`),
  );
});

/** A stored cell's pixels, `cells/<key>.png` of a member's sheet. */
export const readCell = Effect.fn('Storybook.readCell')(function* (
  cast: string,
  member: string,
  id: string,
  key: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const file = `${sheetDir(cast, member, id)}/cells/${key}.png`;
  return yield* pngOf(yield* fs.readFile(file), file);
});

/** A sheet split into `cells` cells with `palette`, writing `cell-<i>.png` and `cells.json` to `out`. */
export const splitFiles = Effect.fn('Storybook.splitFiles')(function* (
  sheet: string,
  cells: number,
  palette: string,
  out: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const bytes = yield* fs.readFile(sheet);
  const raster = yield* pngOf(bytes, sheet);
  const split = yield* Effect.fromResult(splitSheet(raster, cells, yield* readPalette(palette)));
  yield* fs.makeDirectory(out, { recursive: true });
  for (const [i, cell] of split.cells.entries())
    yield* fs.writeFile(path.join(out, `cell-${i}.png`), encodePng(cell.raster));
  yield* fs.writeFileString(
    path.join(out, 'cells.json'),
    `${yield* Schema.encodeEffect(CellsJson)({ sheet: sha256(bytes), cells: split.cells.map((c) => c.box) })}\n`,
  );
  return split;
});

/**
 * The grounds a sheet may be drawn on, in the order they are tried: the
 * house paper first, then pale greens no figure is painted in.
 */
export const GROUNDS = ['#fdf7e5', '#a6dcae', '#8ecf9c', '#a8dff0'] as const;

/** How far (ΔE76) the ground must lie from every paint, and how far as a channel sum, so the split never keys a paint out. */
const GROUND_DELTA_E = 25;
const GROUND_SUM = 60;

/** The first ground at least ΔE 25 and a channel sum of 60 from every colour of `palette`, none when no ground is. */
export const groundFor = (palette: Palette): Option.Option<string> => {
  const paints = paintsOf(palette);
  return Option.fromUndefinedOr(
    GROUNDS.find((g) =>
      paints.every(
        (p) =>
          deltaE(rgbOfHex(g), p.rgb) >= GROUND_DELTA_E && rgbSum(rgbOfHex(g), p.rgb) >= GROUND_SUM,
      ),
    ),
  );
};

/** What each key a sheet may hold draws: the pose of one figure. */
export const POSES = new Map<string, string>([
  [
    'side',
    "standing in full profile facing the viewer's right, both arms hanging in their sleeves at the sides",
  ],
  [
    'threeQuarter',
    "standing turned three-quarters toward the viewer's right, both arms hanging in their sleeves at the sides",
  ],
  ['front', 'standing facing the viewer square, both arms hanging in their sleeves at the sides'],
  [
    'lift',
    "facing the viewer, the left hand (on the viewer's right) lifted in its sleeve to the front of the waist, the elbow bent, the other arm hanging",
  ],
  [
    'offer',
    "facing the viewer, the left hand (on the viewer's right) reached out to the side at shoulder height in its sleeve, a greeting begun, the other arm hanging",
  ],
  [
    'wave-1',
    "facing the viewer, the left hand (on the viewer's right) raised in its sleeve above the shoulder beside the head, the forearm upright, waving, the other arm hanging",
  ],
  [
    'wave-2',
    "facing the viewer, the left hand (on the viewer's right) raised in its sleeve above the shoulder, the forearm leaning out away from the head, the other beat of the wave, the other arm hanging",
  ],
  [
    'neutral',
    'seated on the low wooden stool facing the viewer square, both round hands resting on the knees, head and eyes to the viewer, a calm short smile line',
  ],
  [
    'smile',
    'seated on the stool exactly as in the first figure, the head a quarter turned toward the side the description names, a kind closed smile',
  ],
  [
    'turn',
    'seated on the stool exactly as in the first figure, the head a quarter turned toward the side the description names, surprised: brows raised, eyes open, a small round open mouth',
  ],
]);

/** A palette's paints as the prompt names them: each part's base and shade by hex, a part with no shade drawn flat in one colour. */
const paintWords = (palette: Palette): string =>
  [
    `the outline ink ${palette.ink}`,
    ...palette.parts.map((p) =>
      Option.match(Option.fromUndefinedOr(p.shade), {
        onNone: () => `${p.name} ${p.base}, drawn flat in that one colour`,
        onSome: (shade) => `${p.name} ${p.base} with its shaded side ${shade}`,
      }),
    ),
  ].join('; ');

/**
 * The prompt of one shot sheet: the person (their look), each key's pose in
 * order, the continuity clause, the house rules (round hands with no thumb
 * and no fingers, sleeves to the wrist, one flat shade per colour), the
 * palette by hex and the one flat ground by hex.
 */
export const promptOf = (
  look: string,
  keys: ReadonlyArray<string>,
  palette: Palette,
  ground: string,
): string =>
  [
    `One shot sheet for an animated film: the one person in the reference images drawn ${keys.length} times in one row, left to right, in exactly this order:`,
    ...keys.map((k, i) => `${i + 1}. ${POSES.get(k) ?? k}.`),
    `The person, as described: ${look.trim()} Where the description names an order of figures, the order above holds.`,
    `Continuity: this is one person drawn ${keys.length} times in one pass, so every figure has the same face, the same head size, the same body proportions, the same colours, the same line weight and the same shading; only the turn and the pose change. All figures stand on one baseline at one size, the soles of every figure on the same line.`,
    'House rules: each hand is a plain round circle of skin at the end of its sleeve, no thumb and no fingers. Sleeves run to the wrist in every figure, the raised arm too: no bare arm or forearm ever shows. One bold warm-dark outline of even weight round each figure. One flat shade per colour: no gradient, no texture, no airbrush, no highlight.',
    `Paint with exactly these colours: ${paintWords(palette)}.`,
    `The ground: one flat colour, ${ground}, everywhere behind and between the figures, with wide clear ground between each figure and the next (a reaching or raised hand too) so no figure touches or nears another; no glow, halo or soft light round any figure; no floor, no cast shadow, no text, no frame.`,
  ].join('\n');

/** Each pose key `keys` names, or the first key no pose is written for. */
const unknownKey = (keys: ReadonlyArray<string>): Option.Option<string> =>
  Option.fromUndefinedOr(keys.find((k) => !POSES.has(k)));

/** Refuse a drawn sheet whose ground lies near a paint or whose split finds fewer figures than keys; else its split. */
export const checkDrawn = (
  raster: Raster,
  keys: ReadonlyArray<string>,
  palette: Palette,
): Effect.Effect<Split, DrawRefused> =>
  Effect.gen(function* () {
    const ground = groundOf(raster);
    const near = Option.fromUndefinedOr(
      paintsOf(palette).find((p) => rgbSum(p.rgb, ground) < GROUND_SUM),
    );
    if (Option.isSome(near))
      return yield* DrawRefused.make({
        reason: `its ground ${hexOf(ground)} lies within a channel sum of ${GROUND_SUM} of ${near.value.part} ${hexOf(near.value.rgb)}`,
      });
    const figures = figuresIn(clearBackground(raster, ground));
    if (figures < keys.length)
      return yield* DrawRefused.make({
        reason: `its split finds ${figures} figures, ${keys.length} keys asked`,
      });
    return yield* Effect.fromResult(splitSheet(raster, keys.length, palette)).pipe(
      Effect.mapError((e) => DrawRefused.make({ reason: e.reason })),
    );
  });

/** The record's day: `YYYY-MM-DD`. */
const today = Effect.map(DateTime.now, DateTime.formatIsoDate);

/**
 * One shot sheet drawn: one `okra image` pass through `ImageRoute` (the
 * subscription route) with the member's kept views `refs` as references,
 * checked, split with the member's palette into one cell per key, the cells
 * stored as `cells/<key>.png` and the record written. Refuses an id already
 * drawn, a key no pose is written for, and a draw `checkDrawn` refuses; a
 * refused draw writes nothing under the cast.
 */
export const drawSheet = Effect.fn('Storybook.drawSheet')(function* (
  cast: string,
  member: string,
  id: string,
  keys: ReadonlyArray<string>,
  refs: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const route = yield* ImageRoute;
  const dir = sheetDir(cast, member, id);
  if (yield* fs.exists(`${dir}/record.json`))
    return yield* DrawRefused.make({ reason: `${member}'s sheet ${id} is drawn already` });
  const unknown = unknownKey(keys);
  if (Option.isSome(unknown))
    return yield* DrawRefused.make({
      reason: `no pose is written for key ${unknown.value} (${[...POSES.keys()].join(', ')})`,
    });
  const palette = yield* memberPalette(cast, member);
  const ground = groundFor(palette);
  if (Option.isNone(ground))
    return yield* DrawRefused.make({
      reason: `no ground lies apart from every paint of ${member}`,
    });
  const look = yield* fs.readFileString(`${cast}/${member}/cast-sheet/look.md`);
  const refFiles = refs.map((view) => `cast-sheet/views/${view}.png`);
  const refShas = yield* Effect.forEach(refFiles, (file) =>
    fs
      .readFile(`${cast}/${member}/${file}`)
      .pipe(Effect.map((bytes) => ({ file, sha256: sha256(bytes) }))),
  );
  const prompt = promptOf(look, keys, palette, ground.value);
  const scratch = yield* fs.makeTempDirectory({ prefix: `storybook-${member}-${id}-` });
  const out = `${scratch}/sheet.png`;
  yield* route.draw({
    prompt,
    refs: refFiles.map((file) => `${cast}/${member}/${file}`),
    size: SHEET_SIZE,
    out,
  });
  const bytes = yield* fs.readFile(out);
  const split = yield* checkDrawn(yield* pngOf(bytes, out), keys, palette).pipe(
    Effect.mapError((e) => DrawRefused.make({ reason: `${e.reason}; the draw is at ${out}` })),
  );
  yield* fs.makeDirectory(`${dir}/cells`, { recursive: true });
  yield* fs.writeFile(`${dir}/sheet.png`, bytes);
  const cells = yield* Effect.forEach(split.cells, (cell, i) =>
    Effect.gen(function* () {
      const key = keys[i] ?? `cell-${i}`;
      const png = encodePng(cell.raster);
      yield* fs.writeFile(`${dir}/cells/${key}.png`, png);
      return { key, box: cell.box, sha256: sha256(png) };
    }),
  );
  const record: SheetRecord = {
    member,
    id,
    prompt,
    refs: refShas,
    sheet: sha256(bytes),
    size: SHEET_SIZE,
    ground: hexOf(split.ground),
    drawn: yield* today,
    cells,
  };
  yield* fs.writeFileString(
    `${dir}/record.json`,
    `${yield* Schema.encodeEffect(RecordJson)(record)}\n`,
  );
  return record;
});

/** The owner's keep written on a drawn sheet's record: the day, his words and the ask he answered. */
export const keepSheet = Effect.fn('Storybook.keepSheet')(function* (
  cast: string,
  member: string,
  id: string,
  why: string,
  ask: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const record = yield* readRecord(cast, member, id);
  const kept: SheetRecord = { ...record, kept: { date: yield* today, why, ask } };
  yield* fs.writeFileString(
    `${sheetDir(cast, member, id)}/record.json`,
    `${yield* Schema.encodeEffect(RecordJson)(kept)}\n`,
  );
  return kept;
});
