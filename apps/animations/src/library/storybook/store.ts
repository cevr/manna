import { decodePng, encodePng, ImageRoute, type Raster } from '@manna/film/tools';
import { DateTime, Effect, FileSystem, Option, Path, Result, Schema } from 'effect';
import { Digest } from 'effect/crypto';
import sharp from 'sharp';
import {
  anchorOf,
  blinkOf,
  deltaE,
  figuresIn,
  clearBackground,
  groundOf,
  hexOf,
  type Lines,
  linesOf,
  type Paint,
  type Palette,
  PaletteJson,
  PalettePart,
  paintsOf,
  rgbOfHex,
  rgbSum,
  shareOf,
  sheetHeadOf,
  splitSheet,
  type Split,
  SPLIT_RULES,
  type SplitRules,
  withHeadOf,
  withProps,
} from './sheet.ts';
import { drawnKeyOf, type Figure, figuresOf, type Layer, type Shot } from './shot.ts';

/** Where each member's folder lies (its `cast-sheet/` and `shot-sheets/`): the library's cast, or a film's own roles before it. */
export interface Cast {
  readonly dirOf: (member: string) => string;
}

/** A cast whose every member is a folder under `root`. */
export const libraryCast = (root: string): Cast => ({ dirOf: (member) => `${root}/${member}` });

/** The shared cast, where each member's palette, kept views and shot sheets live. */
export const CAST = libraryCast(`${import.meta.dir}/../cast`);

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
  /** The opt-in split rules its cells were cut under (`SplitRules`), by name: every one on a sheet drawn since the rules, none (absent) on a sheet drawn before them, which re-splits as it was. */
  rules: Schema.optionalKey(Schema.Array(Schema.Literals(SPLIT_RULES))),
  /** Paints this sheet alone adds to its member's palette (a prop the sheet draws, as the lead's bottle on `iio-table`): appended after the member's parts, so every other sheet of the member splits as it did. */
  props: Schema.optionalKey(Schema.Array(PalettePart)),
  /** The owner's keep: absent until he keeps the sheet. */
  kept: Schema.optionalKey(
    Schema.Struct({ date: Schema.String, why: Schema.String, ask: Schema.String }),
  ),
});

export type SheetRecord = typeof SheetRecord.Type;

/** The split rules a sheet drawn now is split under, and its record names: all of them. */
export const DRAWN_RULES: SplitRules = { unstray: true, feetLow: true, unmottle: true };

/** The split rules a stored sheet re-splits under, as its record names them. */
export const splitRulesOf = (record: SheetRecord): SplitRules => {
  const named = new Set(record.rules ?? []);
  return {
    unstray: named.has('unstray'),
    feetLow: named.has('feet-low'),
    unmottle: named.has('unmottle'),
  };
};

/** The rule names a record holds for `rules`. */
const ruleNamesOf = (rules: SplitRules): ReadonlyArray<(typeof SPLIT_RULES)[number]> =>
  SPLIT_RULES.filter(
    (name) =>
      ({ unstray: rules.unstray, 'feet-low': rules.feetLow, unmottle: rules.unmottle })[name],
  );

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

/** The SHA-256 of `bytes` in lowercase hex, by the `Digest` the context provides. */
export const sha256 = (bytes: Uint8Array): Effect.Effect<string, never, Digest.Digest> =>
  Digest.Digest.use((digest) => digest.digestHex(Digest.sha256, bytes));

/** Where a member's shot sheet lives. */
export const sheetDir = (cast: Cast, member: string, id: string): string =>
  `${cast.dirOf(member)}/shot-sheets/${id}`;

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
export const memberPalette = (cast: Cast, member: string) =>
  readPalette(`${cast.dirOf(member)}/cast-sheet/palette.json`);

/** The palette a stored sheet splits with: its member's, then the props its record adds. */
export const sheetPalette = Effect.fn('Storybook.sheetPalette')(function* (
  cast: Cast,
  record: SheetRecord,
) {
  return withProps(yield* memberPalette(cast, record.member), record.props ?? []);
});

/** A member's shot sheet record. */
export const readRecord = Effect.fn('Storybook.readRecord')(function* (
  cast: Cast,
  member: string,
  id: string,
) {
  const fs = yield* FileSystem.FileSystem;
  return yield* Schema.decodeEffect(RecordJson)(
    yield* fs.readFileString(`${sheetDir(cast, member, id)}/record.json`),
  );
});

/**
 * A stored cell's PNG as its 8-bit RGBA pixels, decoded by libvips
 * (sharp), or why not, naming `file`. A cell is written 8-bit RGBA with no
 * colour profile (`encodePng`), which libvips reads pixel for pixel as
 * `decodePng` does, about ten times faster: a shot's load decodes every
 * cell of every sheet.
 */
const cellPngOf = (bytes: Uint8Array, file: string) =>
  Effect.tryPromise({
    try: () =>
      sharp(bytes).ensureAlpha().raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true }),
    catch: (e) => StoreFailed.make({ reason: `${file}: ${String(e)}` }),
  }).pipe(
    Effect.map(({ data, info }): Raster => ({
      width: info.width,
      height: info.height,
      rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    })),
  );

/** A stored cell's pixels, `cells/<key>.png` of a member's sheet. */
export const readCell = Effect.fn('Storybook.readCell')(function* (
  cast: Cast,
  member: string,
  id: string,
  key: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const file = `${sheetDir(cast, member, id)}/cells/${key}.png`;
  return yield* cellPngOf(yield* fs.readFile(file), file);
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
    `${yield* Schema.encodeEffect(CellsJson)({ sheet: yield* sha256(bytes), cells: split.cells.map((c) => c.box) })}\n`,
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
    'seated on the stool exactly as in the first figure, head and eyes still to the viewer, a broad warm closed smile, the mouth shut, the cheeks lifted',
  ],
  [
    'turn',
    "seated on the stool exactly as in the first figure, the head a quarter turned toward the viewer's left, looking at someone who stands at the left edge of the picture: the eyes, nose and mouth shifted toward the picture's left, the ear on the picture's right showing; this turn is to the viewer's left even where the description names the right; the same broad warm closed smile, the mouth shut",
  ],
  [
    'neutralBlink',
    'seated on the stool exactly as in the first figure, every line the same, the eyes closed in a blink: each eye a short downward-curved ink line',
  ],
  [
    'threeQuarterBlink',
    "standing exactly as the figure turned three-quarters toward the viewer's right, every line the same, the eyes closed in a blink: each eye a short downward-curved ink line",
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

/** How near (ΔE76) two parts' base paints lie for the prompt to set them apart: a part drawn this far off its hex can land nearer the other's, and the snap then paints it the other part. */
export const CLOSE_PAINTS = 12;

/**
 * The prompt's words for each pair of parts whose base paints lie within
 * `CLOSE_PAINTS`: the ink outline drawn between them wherever they meet,
 * each exactly its own hex. The kept views part a pale sash from a pale
 * tunic by its outline, not by its colour (critique 1, item 1).
 */
const closeWords = (palette: Palette): ReadonlyArray<string> =>
  palette.parts.flatMap((a, i) =>
    palette.parts.slice(i + 1).flatMap((b) => {
      if (deltaE(rgbOfHex(a.base), rgbOfHex(b.base)) >= CLOSE_PAINTS) return [];
      return [
        `the ${a.name} ${a.base} and the ${b.name} ${b.base} lie close, so the bold ink ${palette.ink} outline runs between them wherever they meet, and each is painted exactly its own hex; the ${b.name} reads apart from the ${a.name} by that outline`,
      ];
    }),
  );

/** The prompt's words for a sash, when the palette has one: outlined in the ink like every part, its knot one small round knot with two tails hanging, the same in every figure (critique 1, items 1 and 11). */
const sashWords = (palette: Palette): ReadonlyArray<string> =>
  palette.parts.flatMap((p) => {
    if (p.role !== 'sash') return [];
    return [
      `The ${p.name}: outlined all round in the same ink ${palette.ink} as the figure, as in the reference images; tied in front with one small round knot and two tails hanging, the knot the same small round knot in every figure; its folds in its own shade, never pink.`,
    ];
  });

/**
 * The prompt of one shot sheet: the person (their look), each key's pose in
 * order, the continuity clause, the house rules (round hands with no thumb
 * and no fingers, sleeves to the wrist, one flat shade per colour), the
 * palette by hex, each pair of close paints set apart, and the one flat
 * ground by hex.
 */
export const promptOf = (
  look: string,
  keys: ReadonlyArray<string>,
  palette: Palette,
  ground: string,
  words: SheetWords = LIBRARY_WORDS,
): string =>
  [
    `One shot sheet for an animated film: the one person in the reference images drawn ${keys.length} times in one row, left to right, in exactly this order:`,
    ...keys.map((k, i) => `${i + 1}. ${words.poses.get(k) ?? k}.`),
    `The person, as described: ${look.trim()} Where the description names an order of figures, the order above holds.`,
    `Continuity: this is one person drawn ${keys.length} times in one pass, so every figure has the same face, the same head size, the same body proportions, the same colours, the same line weight and the same shading; only the turn and the pose change. All figures stand on one baseline at one size, the soles of every figure on the same line.`,
    'House rules: each hand is a plain round circle of skin at the end of its sleeve, no thumb and no fingers. Sleeves run to the wrist in every figure, the raised arm too: no bare arm or forearm ever shows. One bold warm-dark outline of even weight round each figure. One flat shade per colour: no gradient, no texture, no airbrush, no highlight.',
    `Clothes: every part of the clothes is outlined in the same ink ${palette.ink} as the figure; a fold on cloth is a line in that cloth's own shade; no rose, pink or skin colour anywhere on the clothes, skin colour only on the face, neck, hands and feet.`,
    `Paint with exactly these colours: ${paintWords(palette)}.`,
    ...sashWords(palette),
    ...closeWords(palette).map((w) => `Close colours: ${w}.`),
    `The ground: one flat colour, ${ground}, everywhere behind and between the figures, with wide clear ground between each figure and the next (a reaching or raised hand too) so no figure touches or nears another; no glow, halo or soft light round any figure; no floor, no cast shadow, no text, no frame.`,
    ...words.rules,
  ].join('\n');

/** What a sheet's prompt says beyond the house rules: each key's pose words, any rules its film adds, each a line of its own after the ground, and the props it paints beyond its member's palette (`SheetRecord.props`). */
export interface SheetWords {
  readonly poses: ReadonlyMap<string, string>;
  readonly rules: ReadonlyArray<string>;
  readonly props: ReadonlyArray<PalettePart>;
}

/** The library's own words: its `POSES`, no rule beyond the house's and no prop. */
export const LIBRARY_WORDS: SheetWords = { poses: POSES, rules: [], props: [] };

/** Each pose key `keys` names, or the first key no pose is written for. */
const unknownKey = (
  keys: ReadonlyArray<string>,
  poses: SheetWords['poses'],
): Option.Option<string> => Option.fromUndefinedOr(keys.find((k) => !poses.has(k)));

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
    return yield* Effect.fromResult(splitSheet(raster, keys.length, palette, DRAWN_RULES)).pipe(
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
  cast: Cast,
  member: string,
  id: string,
  keys: ReadonlyArray<string>,
  refs: ReadonlyArray<string>,
  words: SheetWords = LIBRARY_WORDS,
) {
  const fs = yield* FileSystem.FileSystem;
  const route = yield* ImageRoute;
  const dir = sheetDir(cast, member, id);
  if (yield* fs.exists(`${dir}/record.json`))
    return yield* DrawRefused.make({ reason: `${member}'s sheet ${id} is drawn already` });
  const unknown = unknownKey(keys, words.poses);
  if (Option.isSome(unknown))
    return yield* DrawRefused.make({
      reason: `no pose is written for key ${unknown.value} (${[...words.poses.keys()].join(', ')})`,
    });
  const palette = withProps(yield* memberPalette(cast, member), words.props);
  const ground = groundFor(palette);
  if (Option.isNone(ground))
    return yield* DrawRefused.make({
      reason: `no ground lies apart from every paint of ${member}`,
    });
  const look = yield* fs.readFileString(`${cast.dirOf(member)}/cast-sheet/look.md`);
  const refFiles = refs.map((view) => `cast-sheet/views/${view}.png`);
  const refShas = yield* Effect.forEach(refFiles, (file) =>
    fs.readFile(`${cast.dirOf(member)}/${file}`).pipe(
      Effect.flatMap(sha256),
      Effect.map((hash) => ({ file, sha256: hash })),
    ),
  );
  const prompt = promptOf(look, keys, palette, ground.value, words);
  const scratch = yield* fs.makeTempDirectory({ prefix: `storybook-${member}-${id}-` });
  const out = `${scratch}/sheet.png`;
  yield* route.draw({
    prompt,
    refs: refFiles.map((file) => `${cast.dirOf(member)}/${file}`),
    size: SHEET_SIZE,
    out,
  });
  const bytes = yield* fs.readFile(out);
  const split = yield* checkDrawn(yield* pngOf(bytes, out), keys, palette).pipe(
    Effect.mapError((e) => DrawRefused.make({ reason: `${e.reason}; the draw is at ${out}` })),
  );
  yield* fs.makeDirectory(dir, { recursive: true });
  yield* fs.writeFile(`${dir}/sheet.png`, bytes);
  const record: SheetRecord = {
    member,
    id,
    prompt,
    rules: ruleNamesOf(DRAWN_RULES),
    ...propsOf(words.props),
    refs: refShas,
    sheet: yield* sha256(bytes),
    size: SHEET_SIZE,
    ground: hexOf(split.ground),
    drawn: yield* today,
    cells: yield* storeCells(dir, keys, split, paintsOf(palette)),
  };
  yield* writeRecord(dir, record);
  return record;
});

/** A record's `props` field: the props when a sheet paints any, else no field, so a sheet with none records as before. */
const propsOf = (props: ReadonlyArray<PalettePart>): Pick<SheetRecord, 'props'> =>
  Option.match(
    Option.liftPredicate(props, (p) => p.length > 0),
    {
      onNone: () => ({}),
      onSome: (some) => ({ props: some }),
    },
  );

/** A split's cells stored as `<dir>/cells/<key>.png`, the keys in the cells' order, and the sheet's cells module (`cellsModuleOf`): each key, its box and its PNG's sha256. */
const storeCells = Effect.fn('Storybook.storeCells')(function* (
  dir: string,
  keys: ReadonlyArray<string>,
  split: Split,
  paints: ReadonlyArray<Paint>,
) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(`${dir}/cells`, { recursive: true });
  const stored = yield* Effect.forEach(split.cells, (cell, i) =>
    Effect.gen(function* () {
      const key = keys[i] ?? `cell-${i}`;
      const png = encodePng(cell.raster);
      if (cell.skinFar > 0)
        yield* Effect.logWarning(
          `storybook.skin-far sheet=${dir} cell=${key} px=${cell.skinFar}: skin repainted with a paint past SNAP_RADIUS of its drawn colour; the palette lacks a paint for that colour`,
        );
      yield* fs.writeFile(`${dir}/cells/${key}.png`, png);
      return { key, box: cell.box, sha256: yield* sha256(png) };
    }),
  );
  yield* fs.writeFileString(
    `${dir}/cells.ts`,
    cellsModuleOf(split.cells.map((c, i) => cellEntryOf(keys[i] ?? `cell-${i}`, c.raster, paints))),
  );
  return stored;
});

/** One cell as a film draws it: its key, its size in px, its soles' centre (`anchorOf`) and its head (crown to collar) in px where its lines read one. */
export interface CellEntry {
  readonly key: string;
  readonly size: readonly [number, number];
  readonly ax: number;
  readonly ay: number;
  readonly head: Option.Option<number>;
}

/** A stored cell's entry, read as the store reads it: its lines on the cell at its sheet's size. */
export const cellEntryOf = (key: string, cell: Raster, paints: ReadonlyArray<Paint>): CellEntry => {
  const lines = linesOf(cell, paints);
  const anchor = Option.match(lines, {
    onNone: () => ({ ax: cell.width / 2, ay: cell.height }),
    onSome: anchorOf,
  });
  return {
    key,
    size: [cell.width, cell.height],
    ...anchor,
    head: Option.flatMap(lines, (l) => l.head),
  };
};

/**
 * A sheet's cells module, `cells.ts` beside its record: each cell's PNG
 * imported as a file and its entry, so a film's drawing declares and pins
 * the cells as the store reads them. Written by `storybook draw` and
 * `storybook resplit`, and held to the cells by a unit test.
 */
export const cellsModuleOf = (entries: ReadonlyArray<CellEntry>): string =>
  [
    ...entries.map((e, i) => `import cell${i} from './cells/${e.key}.png' with { type: 'file' };`),
    '',
    '/** Each cell of this sheet as a film draws it: its PNG, its size in px, its soles’ centre and its head (crown to collar) in px where its lines read one. Written by `storybook draw` and `storybook resplit`. */',
    'export const CELLS = {',
    ...entries.map((e, i) => {
      const head = Option.match(e.head, { onNone: () => '', onSome: (h) => `, head: ${h}` });
      return `  '${e.key}': { png: cell${i}, size: [${e.size[0]}, ${e.size[1]}], ax: ${e.ax}, ay: ${e.ay}${head} },`;
    }),
    '} as const;',
    '',
  ].join('\n');

/** A cell's entry as a cells module holds it, its PNG aside. */
interface HeldEntry {
  readonly size: readonly [number, number];
  readonly ax: number;
  readonly ay: number;
  readonly head?: number;
}

/**
 * Every way a sheet's cells module (`cells`, as a film imports it) differs
 * from the sheet stored in `dir`: a key out of the record's order, a PNG that
 * is not the recorded one, an entry the store reads otherwise off its cell.
 */
export const cellsMisses = Effect.fn('Storybook.cellsMisses')(function* (
  dir: string,
  paints: ReadonlyArray<Paint>,
  cells: Readonly<Record<string, HeldEntry & { readonly png: string }>>,
) {
  const fs = yield* FileSystem.FileSystem;
  const record = yield* Schema.decodeEffect(RecordJson)(
    yield* fs.readFileString(`${dir}/record.json`),
  );
  const keys = record.cells.map((c) => c.key);
  const order = Option.toArray(
    Option.some(`${dir} holds ${Object.keys(cells).join(',')}, its record ${keys.join(',')}`).pipe(
      Option.filter(() => Object.keys(cells).join() !== keys.join()),
    ),
  );
  const each = yield* Effect.forEach(record.cells, (c) =>
    Effect.gen(function* () {
      const entry = Option.fromUndefinedOr(cells[c.key]);
      if (Option.isNone(entry)) return [];
      const bytes = yield* fs.readFile(entry.value.png);
      if ((yield* sha256(bytes)) !== c.sha256) return [`${dir}/${c.key} is not the recorded PNG`];
      const raster = yield* pngOf(bytes, entry.value.png);
      const read = cellEntryOf(c.key, raster, paints);
      const head = Option.getOrElse(read.head, () => -1);
      const same =
        entry.value.size[0] === read.size[0] &&
        entry.value.size[1] === read.size[1] &&
        entry.value.ax === read.ax &&
        entry.value.ay === read.ay &&
        (entry.value.head ?? -1) === head;
      if (same) return [];
      return [
        `${dir}/${c.key} holds ${entry.value.size} ${entry.value.ax},${entry.value.ay} head ${entry.value.head ?? 'none'}, reads ${read.size} ${read.ax},${read.ay} head ${head}`,
      ];
    }),
  );
  return [...order, ...each.flat()];
});

/** A record written as `<dir>/record.json`. */
const writeRecord = Effect.fn('Storybook.writeRecord')(function* (
  dir: string,
  record: SheetRecord,
) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFileString(
    `${dir}/record.json`,
    `${yield* Schema.encodeEffect(RecordJson)(record)}\n`,
  );
});

/**
 * A drawn sheet split again: its stored `sheet.png` split with the member's
 * palette as `storybook split` splits it now, each `cells/<key>.png` and the
 * record's ground and cells rewritten; the prompt, refs, sheet hash, day
 * drawn and keep stand, since the drawing is the same. Refuses a
 * `sheet.png` that is not the one its record names.
 */
export const resplitSheet = Effect.fn('Storybook.resplitSheet')(function* (
  cast: Cast,
  member: string,
  id: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const dir = sheetDir(cast, member, id);
  const record = yield* readRecord(cast, member, id);
  const bytes = yield* fs.readFile(`${dir}/sheet.png`);
  if ((yield* sha256(bytes)) !== record.sheet)
    return yield* StoreFailed.make({
      reason: `${member}'s sheet ${id}: sheet.png is not the one its record names`,
    });
  const palette = yield* sheetPalette(cast, record);
  const split = yield* Effect.fromResult(
    splitSheet(
      yield* pngOf(bytes, `${dir}/sheet.png`),
      record.cells.length,
      palette,
      splitRulesOf(record),
    ),
  );
  const again: SheetRecord = {
    ...record,
    ground: hexOf(split.ground),
    cells: yield* storeCells(
      dir,
      record.cells.map((c) => c.key),
      split,
      paintsOf(palette),
    ),
  };
  yield* writeRecord(dir, again);
  return again;
});

/**
 * One figure of a shot as stored: its layer and item, its sheet's record,
 * its palette's paints, its cells by key, each blink its holds show by its
 * drawn key `<cell>~<blink>` (`drawnKeyOf`), each cell's lines and head read
 * once on the cell at its sheet's own size (none where they read none), and
 * its sheet's head.
 */
export interface StoredFigure {
  readonly layer: Layer;
  readonly figure: Figure;
  readonly record: SheetRecord;
  readonly paints: ReadonlyArray<Paint>;
  readonly cells: ReadonlyMap<string, Raster>;
  readonly blinks: ReadonlyMap<string, Raster>;
  readonly lines: ReadonlyMap<string, Option.Option<Lines>>;
  readonly heads: ReadonlyMap<string, Option.Option<number>>;
  readonly head: number;
  /** Its member's palette, the head share with it (`Palette.head`, 1 when it names none). */
  readonly palette: Palette;
}

/** The picture a figure draws for a drawn key: a stored cell, or a blink built from one; none for a key it holds neither of. */
export const drawnCellOf = (f: StoredFigure, key: string): Option.Option<Raster> =>
  Option.orElse(Option.fromUndefinedOr(f.cells.get(key)), () =>
    Option.fromUndefinedOr(f.blinks.get(key)),
  );

/** Each blink a figure's holds show, by its drawn key: the hold's cell with its blink key's closed eyes pasted over its own (`blinkOf`); fails on a cell its sheet lacks or a face whose eyes do not read. */
const blinksOf = (f: Figure, cells: ReadonlyMap<string, Raster>, paints: ReadonlyArray<Paint>) =>
  Effect.forEach(
    f.spans.flatMap((s) => {
      if (s._tag !== 'Hold' || s.whole === true) return [];
      return Option.toArray(
        Option.map(Option.fromUndefinedOr(s.blink), (blink) => ({ cell: s.cell, blink })),
      );
    }),
    ({ cell, blink }) =>
      Effect.gen(function* () {
        const key = drawnKeyOf({ cell, eyes: blink });
        const [open, closed] = [cells.get(cell), cells.get(blink)];
        if (!open || !closed)
          return yield* StoreFailed.make({ reason: `${f.member} has no cell ${cell} or ${blink}` });
        const built = blinkOf(open, closed, paints);
        if (Result.isFailure(built))
          return yield* StoreFailed.make({
            reason: `${f.member}'s ${key}: ${built.failure.message}`,
          });
        return [key, built.success] as const;
      }),
  ).pipe(Effect.map((pairs) => new Map(pairs)));

/** A figure's cells as it draws them: its stored cells, each key it wears another head on (`Figure.worn`) built from the stored cells (`withHeadOf`); fails on a cell its sheet lacks or a head that cannot be worn. */
const wornCellsOf = (
  f: Figure,
  stored: ReadonlyMap<string, Raster>,
  paints: ReadonlyArray<Paint>,
) =>
  Effect.forEach(f.worn ?? [], ({ key, head, body }) =>
    Effect.gen(function* () {
      const [b, h] = [stored.get(body), stored.get(head)];
      if (!b || !h)
        return yield* StoreFailed.make({ reason: `${f.member} has no cell ${body} or ${head}` });
      const built = withHeadOf(b, h, paints);
      if (Result.isFailure(built))
        return yield* StoreFailed.make({
          reason: `${f.member}'s ${key} (${head}'s head on ${body}): ${built.failure.message}`,
        });
      return [key, built.success] as const;
    }),
  ).pipe(Effect.map((pairs) => new Map([...stored, ...pairs])));

/** Every figure of `shot` read from the cast: each its one sheet's record, palette, cells as it draws them (`wornCellsOf`), the blinks its holds show and its cells' lines; fails on a sheet whose cells read no head, on a head that cannot be worn and on a blink that cannot be built. */
export const loadFigures = Effect.fn('Storybook.loadFigures')(function* (cast: Cast, shot: Shot) {
  return yield* Effect.forEach(figuresOf(shot), ({ layer, figure: f }) =>
    Effect.gen(function* () {
      const record = yield* readRecord(cast, f.member, f.sheet);
      const palette = yield* sheetPalette(cast, record);
      const paints = paintsOf(palette);
      const stored = new Map<string, Raster>();
      for (const c of record.cells)
        stored.set(c.key, yield* readCell(cast, f.member, f.sheet, c.key));
      const cells = yield* wornCellsOf(f, stored, paints);
      const lines = new Map([...cells].map(([key, cell]) => [key, linesOf(cell, paints)] as const));
      const heads = new Map(
        [...lines].map(([key, l]) => [key, Option.flatMap(l, (x) => x.head)] as const),
      );
      const head = sheetHeadOf(heads);
      if (Option.isNone(head))
        return yield* StoreFailed.make({ reason: `${f.member}'s sheet ${f.sheet} reads no head` });
      return {
        layer,
        figure: f,
        record,
        paints,
        cells,
        blinks: yield* blinksOf(f, cells, paints),
        lines,
        heads,
        head: head.value,
        palette,
      } satisfies StoredFigure;
    }),
  );
});

/** Each figure's member's head share by figure name, as `frameAt` reads them. */
export const sharesOf = (figures: ReadonlyArray<StoredFigure>): ReadonlyMap<string, number> =>
  new Map(figures.map((f) => [f.figure.name, shareOf(f.palette, f.figure.sheet)] as const));

/** Each figure's sheet head by figure name, as `frameAt` reads them. */
export const headsOf = (figures: ReadonlyArray<StoredFigure>): ReadonlyMap<string, number> =>
  new Map(figures.map((f) => [f.figure.name, f.head] as const));

/** The owner's keep written on a drawn sheet's record: the day, his words and the ask he answered. */
export const keepSheet = Effect.fn('Storybook.keepSheet')(function* (
  cast: Cast,
  member: string,
  id: string,
  why: string,
  ask: string,
) {
  const record = yield* readRecord(cast, member, id);
  const kept: SheetRecord = { ...record, kept: { date: yield* today, why, ask } };
  yield* writeRecord(sheetDir(cast, member, id), kept);
  return kept;
});
