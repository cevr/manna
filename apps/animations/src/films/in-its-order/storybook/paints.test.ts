import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import sharp from 'sharp';
import type { Raster } from '@manna/film/tools';
import { hexOf, medianOf, MOTTLE_PX, paintsOf } from '../../../library/storybook/sheet.ts';
import { SHEET_CELLS } from './cells.ts';
import { SHEETS, sheetNamed } from './sheets.ts';

/** How far (a share of the hair) a cell's head-band hair shade may lie from its member's first sheet's median: the lead's table, milk and redrawn close sheets read 0.5 to 3.5 %, the close before it 19.6 to 20.3 % (critique 2, finding 1). */
const SHADE_SPREAD = 0.05;

/** The most of a head band's hair that may be its hair shade (critique 1, item 4): the table and milk sheets read 0.5 to 8.3 %, the close redrawn from his front 20 % (the curls' shaded undersides, larger in a close), the old close 99.6 % (its base drawn in sandal brown). */
const SHADE_MAX = 0.25;

/** The head band's depth as a share of the cell's head (crown to collar): the top 60 % (critique 1, item 4). */
const BAND = 0.6;

/** Each cell's pixels, decoded once for every case of this file. */
const decoded = new Map<string, Promise<Raster>>();

const rasterOf = (png: string) =>
  Effect.promise(() => {
    const known = decoded.get(png);
    if (known) return known;
    const read = sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }): Raster => ({
        width: info.width,
        height: info.height,
        rgba: new Uint8Array(data),
      }));
    decoded.set(png, read);
    return read;
  });

/** Every cell this film draws: its sheet's key, its name, its PNG and head, and its member's paints. */
const CELLS = [...SHEET_CELLS].flatMap(([sheet, s]) =>
  Object.entries(s.cells).map(([cell, c]) => ({
    sheet,
    cell,
    png: c.png,
    head: Option.fromUndefinedOr(c.head),
    paints: paintsOf(s.palette),
  })),
);

/** The hair base and hair shade pixels in a cell's head band, from its first opaque row down `BAND` of its head. */
const headBandOf = (r: Raster, head: number, paints: (typeof CELLS)[number]['paints']) => {
  const packed = (red: number, green: number, blue: number) => (red << 16) | (green << 8) | blue;
  const tone = new Map(
    paints.flatMap((p) => {
      if (p.role === 'hair') return [[packed(...p.rgb), p.tone] as const];
      return [];
    }),
  );
  let crown = 0;
  while (crown < r.width * r.height && (r.rgba[crown * 4 + 3] ?? 0) === 0) crown++;
  const top = Math.floor(crown / r.width);
  const counts = { base: 0, shade: 0 };
  for (let y = top; y < Math.min(r.height, top + head * BAND); y++)
    for (let x = 0; x < r.width; x++) {
      const i = (y * r.width + x) * 4;
      if ((r.rgba[i + 3] ?? 0) === 0) continue;
      const t = tone.get(packed(r.rgba[i] ?? 0, r.rgba[i + 1] ?? 0, r.rgba[i + 2] ?? 0));
      if (t === 'base' || t === 'shade') counts[t] += 1;
    }
  return counts;
};

/** How far (a share of the head band) a cell's skin, hair or garment may lie from its member's first sheet's median. */
const HEAD_SPREAD = 0.05;

/** The members whose sheets each draw another person of the group: the four diners, the grown villager and the baby. */
const CROWDS = ['filler-dressed', 'idea-villagers'];

/**
 * Each part's share of a cell's head band (`BAND` of its head from its
 * first opaque row), by group: `skin`, each hair and footwear paint by its
 * role and tone apart (the head band holds no sandals, so a footwear paint
 * there is hair: the take-5 woman's darker hair is split in her sandals'
 * paint, so counting it apart holds that shade), and each garment by its
 * name; the ink, props and others left out.
 */
const headPartsOf = (
  r: Raster,
  head: number,
  paints: (typeof CELLS)[number]['paints'],
): ReadonlyMap<string, number> => {
  const packed = (red: number, green: number, blue: number) => (red << 16) | (green << 8) | blue;
  const groupOf = new Map(
    paints.flatMap((p) => {
      if (p.role === 'skin') return [[packed(...p.rgb), 'skin'] as const];
      if (p.role === 'hair' || p.role === 'footwear')
        return [[packed(...p.rgb), `${p.role} ${p.tone}`] as const];
      if (p.role === 'garment') return [[packed(...p.rgb), p.part] as const];
      return [];
    }),
  );
  let crown = 0;
  while (crown < r.width * r.height && (r.rgba[crown * 4 + 3] ?? 0) === 0) crown++;
  const top = Math.floor(crown / r.width);
  const counts = new Map<string, number>();
  let opaque = 0;
  for (let y = top; y < Math.min(r.height, top + head * BAND); y++)
    for (let x = 0; x < r.width; x++) {
      const i = (y * r.width + x) * 4;
      if ((r.rgba[i + 3] ?? 0) === 0) continue;
      opaque++;
      const group = groupOf.get(packed(r.rgba[i] ?? 0, r.rgba[i + 1] ?? 0, r.rgba[i + 2] ?? 0));
      if (group) counts.set(group, (counts.get(group) ?? 0) + 1);
    }
  return new Map([...counts].map(([group, n]) => [group, n / Math.max(1, opaque)]));
};

/** The cells of each sheet with props that hold its prop: the lead's bottle in `lift`, `bottle` and `read` and its blink (where the letter's parchment is the bottle's cream too), his close's sash light in every cell, the older diner's open mouth in `talk`. */
const PROP_CELLS: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  ['lead-feast/iio-table', ['lift', 'bottle', 'read', 'readBlink']],
  ['lead-feast/iio-close', ['down', 'downBlink', 'wince']],
  ['filler-dressed/iio-diner-3', ['talk']],
]);

/** The most of a cell's opaque pixels that may lie in blotches of skin shade (4-connected islands of `MOTTLE_PX` or fewer): his sheets before the redrawn table sheet read 0.1 % at most, that sheet split plain 1 %. */
const MOTTLE_MAX = 0.005;

/** Each pixel of a cell marked 1 where it is a skin shade, and the count of its opaque pixels. */
const shadeMask = (r: Raster, paints: (typeof CELLS)[number]['paints']) => {
  const shades = new Set(
    paints
      .filter((p) => p.role === 'skin' && p.tone === 'shade')
      .map((p) => (p.rgb[0] << 16) | (p.rgb[1] << 8) | p.rgb[2]),
  );
  const { width, height, rgba } = r;
  const mask = new Uint8Array(width * height);
  let opaque = 0;
  for (let q = 0; q < width * height; q++) {
    if ((rgba[q * 4 + 3] ?? 0) === 0) continue;
    opaque++;
    const key = ((rgba[q * 4] ?? 0) << 16) | ((rgba[q * 4 + 1] ?? 0) << 8) | (rgba[q * 4 + 2] ?? 0);
    mask[q] = Number(shades.has(key));
  }
  return { mask, opaque };
};

/** The size of the 4-connected island of marked pixels from `start`, each marked 2 as it is taken. */
const islandFrom = (mask: Uint8Array, width: number, start: number): number => {
  mask[start] = 2;
  const stack = [start];
  let n = 0;
  while (stack.length > 0) {
    const q = stack.pop() ?? 0;
    n++;
    const x = q % width;
    for (const m of [q - width, q + width, q - 1, q + 1]) {
      if (m < 0 || m >= mask.length || Math.abs((m % width) - x) > 1 || mask[m] !== 1) continue;
      mask[m] = 2;
      stack.push(m);
    }
  }
  return n;
};

/** The share of a cell's opaque pixels in blotches of a skin shade: islands of `MOTTLE_PX` pixels or fewer. */
const mottleShare = (r: Raster, paints: (typeof CELLS)[number]['paints']): number => {
  const { mask, opaque } = shadeMask(r, paints);
  let blotched = 0;
  for (let q = 0; q < mask.length; q++) {
    if (mask[q] !== 1) continue;
    const n = islandFrom(mask, r.width, q);
    if (n <= MOTTLE_PX) blotched += n;
  }
  return blotched / Math.max(1, opaque);
};

describe("In Its Order's sheet paints", () => {
  it.effect(
    'holds the skin’s blotches of shade under 0.5 % of each cell’s opaque pixels, so no face is mottled (the redrawn table sheet split plain; critique 1, item 16)',
    () =>
      Effect.gen(function* () {
        const over = yield* Effect.forEach(CELLS, (c) =>
          Effect.map(rasterOf(c.png), (r) => {
            const share = mottleShare(r, c.paints);
            if (share <= MOTTLE_MAX) return [];
            return [`${c.sheet} ${c.cell}: ${(share * 100).toFixed(2)} %`];
          }),
        );
        expect(over.flat()).toEqual([]);
      }),
  );

  it.effect(
    'lays a sheet’s prop paints in the cells that hold the prop alone, so a prop paint never takes a drawn colour of the figure (a teat paint mottled the lead’s face and hands; critique 1, items 6, 7 and 17)',
    () =>
      Effect.gen(function* () {
        const declared = [...SHEET_CELLS.keys()].filter((sheet) => {
          const [member = '', id = ''] = sheet.split('/');
          return (sheetNamed(member, id)?.props ?? []).length > 0;
        });
        expect(declared.toSorted()).toEqual([...PROP_CELLS.keys()].toSorted());
        const misses = yield* Effect.forEach(
          CELLS.filter((c) => PROP_CELLS.has(c.sheet)),
          (c) =>
            Effect.map(rasterOf(c.png), (r) => {
              const [member = '', id = ''] = c.sheet.split('/');
              const props = new Set((sheetNamed(member, id)?.props ?? []).map((p) => p.base));
              let n = 0;
              for (let q = 0; q < r.width * r.height; q++)
                if (
                  (r.rgba[q * 4 + 3] ?? 0) > 0 &&
                  props.has(
                    hexOf([r.rgba[q * 4] ?? 0, r.rgba[q * 4 + 1] ?? 0, r.rgba[q * 4 + 2] ?? 0]),
                  )
                )
                  n++;
              const holds = PROP_CELLS.get(c.sheet)?.includes(c.cell) ?? false;
              if (holds === n > 0) return [];
              return [`${c.sheet} ${c.cell}: ${n} px of its props`];
            }),
        );
        expect(misses.flat()).toEqual([]);
      }),
  );

  it.effect(
    'draws each head band’s hair in its hair base: its hair shade at most a quarter of the hair there, so no sandal brown takes the base’s place (critique 1, item 4)',
    () =>
      Effect.gen(function* () {
        const hairy = CELLS.filter(
          (c) => Option.isSome(c.head) && c.paints.some((p) => p.role === 'hair'),
        );
        const misses = yield* Effect.forEach(hairy, (c) =>
          Effect.map(rasterOf(c.png), (r) => {
            const band = headBandOf(
              r,
              Option.getOrElse(c.head, () => 0),
              c.paints,
            );
            const share = band.shade / Math.max(1, band.base + band.shade);
            if (share <= SHADE_MAX) return [];
            return [`${c.sheet} ${c.cell}: hair shade ${(share * 100).toFixed(1)} % of the hair`];
          }),
        );
        expect(misses.flat()).toEqual([]);
      }),
  );

  it.effect(
    'draws one head across a member’s sheets: each cell’s head-band hair shade within 5 points of the median of the member’s first sheet, so a close is the man the table drew (critique 2, finding 1: the close read 19.6 to 20.3 %, the table 2.3 to 3.5 %)',
    () =>
      Effect.gen(function* () {
        const shares = yield* Effect.forEach(
          CELLS.filter((c) => Option.isSome(c.head) && c.paints.some((p) => p.role === 'hair')),
          (c) =>
            Effect.map(rasterOf(c.png), (r) => {
              const band = headBandOf(
                r,
                Option.getOrElse(c.head, () => 0),
                c.paints,
              );
              return { ...c, share: band.shade / Math.max(1, band.base + band.shade) };
            }),
        );
        const misses = shares.flatMap((c) => {
          const [member = ''] = c.sheet.split('/');
          const first = SHEETS.find((s) => s.member === member);
          const reference = medianOf(
            shares.filter((o) => o.sheet === `${member}/${first?.id}`).map((o) => o.share),
          );
          if (Option.isNone(reference) || Math.abs(c.share - reference.value) <= SHADE_SPREAD)
            return [];
          return [
            `${c.sheet} ${c.cell}: hair shade ${(c.share * 100).toFixed(1)} % against ${(reference.value * 100).toFixed(1)} % on ${member}/${first?.id}`,
          ];
        });
        expect(misses).toEqual([]);
      }),
  );

  it.effect(
    'draws one face, hair and veil across a member’s sheets: each cell’s head-band share of its skin, its hair and each garment within 5 points of the median of the member’s first sheet (owner, critique 2: the guest woman’s table sheet is the woman her take-5 sheet draws)',
    () =>
      Effect.gen(function* () {
        const several = new Set(
          SHEETS.filter((s, i) => SHEETS.findIndex((o) => o.member === s.member) !== i).map(
            (s) => s.member,
          ),
        );
        const one = (sheet: string) => {
          const member = sheet.split('/')[0] ?? '';
          return several.has(member) && !CROWDS.includes(member);
        };
        const shares = yield* Effect.forEach(
          CELLS.filter((c) => Option.isSome(c.head) && one(c.sheet)),
          (c) =>
            Effect.map(rasterOf(c.png), (r) => ({
              ...c,
              parts: headPartsOf(
                r,
                Option.getOrElse(c.head, () => 0),
                c.paints,
              ),
            })),
        );
        const misses = shares.flatMap((c) => {
          const [member = ''] = c.sheet.split('/');
          const first = SHEETS.find((s) => s.member === member);
          const theirs = shares.filter((o) => o.sheet === `${member}/${first?.id}`);
          return [
            ...new Set([...c.parts.keys(), ...theirs.flatMap((o) => [...o.parts.keys()])]),
          ].flatMap((part) => {
            const reference = medianOf(theirs.map((o) => o.parts.get(part) ?? 0));
            const share = c.parts.get(part) ?? 0;
            if (Option.isNone(reference) || Math.abs(share - reference.value) <= HEAD_SPREAD)
              return [];
            return [
              `${c.sheet} ${c.cell}: ${part} ${(share * 100).toFixed(1)} % against ${(reference.value * 100).toFixed(1)} % on ${member}/${first?.id}`,
            ];
          });
        });
        expect([...several]).toEqual(['lead-feast', 'feast-guest-woman', ...CROWDS]);
        expect(misses).toEqual([]);
      }),
  );
});
