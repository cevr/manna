/* oxlint-disable effect/noNodeBuiltinImport -- Exact's app folder cannot import effect (docs/exact.md): a host helper the reading fonts' tests read the bundled files through. */

/**
 * The reading fonts as files (`assets/fonts/<key>/`): each family's folder,
 * its font files and its `OFL.txt`, each file's SHA-256, `SOURCES.md`'s
 * records, and what a font file says of itself, read from its own tables:
 * its family and version (`name`) and the characters it draws (`cmap`), so
 * a test can hold the KJV's characters to every face without a font tool.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The bundled fonts' folder. */
export const FONTS_DIR = join(import.meta.dir, '..', 'assets', 'fonts');

/** A bundled family's folder: its key, its font files' names and its licence's text. */
export interface FontFolder {
  readonly key: string;
  readonly files: readonly string[];
  readonly licence: string;
}

/** Every family folder under `assets/fonts/`, by key, each file named in order. */
export const readFontFolders = (): FontFolder[] =>
  readdirSync(FONTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted()
    .map((key) => ({
      key,
      files: readdirSync(join(FONTS_DIR, key))
        .filter((name) => /\.(?:ttf|otf)$/u.test(name))
        .toSorted(),
      licence: readFileSync(join(FONTS_DIR, key, 'OFL.txt'), 'utf8'),
    }));

/** A file's bytes, by its path under `assets/fonts/`. */
export const readFontFile = (path: string): Uint8Array => readFileSync(join(FONTS_DIR, path));

/** The SHA-256 of `bytes`, in hex. */
export const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

/** `SOURCES.md`'s text. */
export const readSources = (): string => readFileSync(join(FONTS_DIR, 'SOURCES.md'), 'utf8');

/** One table of a font file: its offset and length. */
interface Table {
  readonly offset: number;
  readonly length: number;
}

/** The table directory of an OpenType file (TrueType or CFF outlines). */
const tablesOf = (view: DataView): ReadonlyMap<string, Table> => {
  const count = view.getUint16(4);
  const tables = new Map<string, Table>();
  for (let index = 0; index < count; index++) {
    const at = 12 + 16 * index;
    const tag = String.fromCharCode(
      view.getUint8(at),
      view.getUint8(at + 1),
      view.getUint8(at + 2),
      view.getUint8(at + 3),
    );
    tables.set(tag, { offset: view.getUint32(at + 8), length: view.getUint32(at + 12) });
  }
  return tables;
};

/** A UTF-16BE string of `length` bytes at `at`. */
const utf16 = (view: DataView, at: number, length: number) =>
  String.fromCharCode(
    ...Array.from({ length: length / 2 }, (_, index) => view.getUint16(at + 2 * index)),
  );

/** The `name` table's string `id` in Windows' Unicode encoding, US English, or '' when it has none. */
const nameOf = (view: DataView, table: Table, id: number) => {
  const count = view.getUint16(table.offset + 2);
  const strings = table.offset + view.getUint16(table.offset + 4);
  for (let index = 0; index < count; index++) {
    const at = table.offset + 6 + 12 * index;
    const [platform, encoding, language, name, length, offset] = [0, 2, 4, 6, 8, 10].map((field) =>
      view.getUint16(at + field),
    );
    if (platform === 3 && encoding === 1 && language === 0x409 && name === id)
      return utf16(view, strings + (offset ?? 0), length ?? 0);
  }
  return '';
};

/** The glyph a format 4 subtable maps `code` to, 0 (the missing one) when none. */
const glyphIn4 = (view: DataView, at: number, code: number) => {
  const segments = view.getUint16(at + 6) / 2;
  const ends = at + 14;
  const starts = ends + 2 * segments + 2;
  const deltas = starts + 2 * segments;
  const ranges = deltas + 2 * segments;
  for (let segment = 0; segment < segments; segment++) {
    if (view.getUint16(ends + 2 * segment) < code) continue;
    const start = view.getUint16(starts + 2 * segment);
    if (start > code) return 0;
    const delta = view.getUint16(deltas + 2 * segment);
    const range = view.getUint16(ranges + 2 * segment);
    if (range === 0) return (code + delta) & 0xffff;
    const glyph = view.getUint16(ranges + 2 * segment + range + 2 * (code - start));
    if (glyph === 0) return 0;
    return (glyph + delta) & 0xffff;
  }
  return 0;
};

/** The glyph a format 12 subtable maps `code` to, 0 (the missing one) when none. */
const glyphIn12 = (view: DataView, at: number, code: number) => {
  const groups = view.getUint32(at + 12);
  for (let group = 0; group < groups; group++) {
    const entry = at + 16 + 12 * group;
    const start = view.getUint32(entry);
    if (code >= start && code <= view.getUint32(entry + 4))
      return view.getUint32(entry + 8) + (code - start);
  }
  return 0;
};

/** The glyph a `cmap` subtable at `subtable` maps a character to, 0 when it draws none. */
const glyphOf = (view: DataView, subtable: number, char: string) => {
  const code = char.codePointAt(0) ?? 0;
  if (subtable < 0) return 0;
  const format = view.getUint16(subtable);
  if (format === 12) return glyphIn12(view, subtable, code);
  if (format === 4 && code <= 0xffff) return glyphIn4(view, subtable, code);
  return 0;
};

/** Where `glyph` sits in a coverage table at `at`, or -1 when it is not covered. */
const coverageIndex = (view: DataView, at: number, glyph: number) => {
  const format = view.getUint16(at);
  const count = view.getUint16(at + 2);
  for (let index = 0; index < count; index++) {
    if (format === 1 && view.getUint16(at + 4 + 2 * index) === glyph) return index;
    if (format === 2) {
      const range = at + 4 + 6 * index;
      const start = view.getUint16(range);
      if (glyph >= start && glyph <= view.getUint16(range + 2))
        return view.getUint16(range + 4) + glyph - start;
    }
  }
  return -1;
};

/** What a single substitution subtable at `at` (GSUB type 1) turns `glyph` into, or `glyph` when it does not cover it. */
const singleSubstitute = (view: DataView, at: number, glyph: number) => {
  const covered = coverageIndex(view, at + view.getUint16(at + 2), glyph);
  if (covered < 0) return glyph;
  if (view.getUint16(at) === 1) return (glyph + view.getInt16(at + 4)) & 0xffff;
  return view.getUint16(at + 6 + 2 * covered);
};

/** The glyph a GSUB feature `tag` puts in place of `glyph` by its single substitutions (an extension's too), or `glyph`. */
const featureGlyph = (view: DataView, gsub: Table, tag: string, glyph: number) => {
  if (gsub.length === 0) return glyph;
  const features = gsub.offset + view.getUint16(gsub.offset + 6);
  const lookups = gsub.offset + view.getUint16(gsub.offset + 8);
  let shown = glyph;
  for (let index = 0; index < view.getUint16(features); index++) {
    const record = features + 2 + 6 * index;
    const name = String.fromCharCode(...[0, 1, 2, 3].map((at) => view.getUint8(record + at)));
    if (name !== tag) continue;
    const feature = features + view.getUint16(record + 4);
    for (let each = 0; each < view.getUint16(feature + 2); each++) {
      const lookup =
        lookups + view.getUint16(lookups + 2 + 2 * view.getUint16(feature + 4 + 2 * each));
      const kind = view.getUint16(lookup);
      for (let sub = 0; sub < view.getUint16(lookup + 4); sub++) {
        const table = lookup + view.getUint16(lookup + 6 + 2 * sub);
        if (kind === 1) shown = singleSubstitute(view, table, shown);
        if (kind === 7 && view.getUint16(table + 2) === 1)
          shown = singleSubstitute(view, table + view.getUint32(table + 4), shown);
      }
    }
    return shown;
  }
  return shown;
};

/** A face's measures as its file states them, in ems: its ascent and descent (`hhea`, as Chrome and Core Text on Apple lay a line out), and a character's advance under `tnum` (the tabular figures a verse's number is drawn in). */
export interface FontMeasures {
  readonly ascent: number;
  readonly descent: number;
  readonly tabular: (char: string) => number;
}

/** The measures of the font file `bytes`. */
export const fontMeasures = (bytes: Uint8Array): FontMeasures => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = tablesOf(view);
  const table = (tag: string) => tables.get(tag) ?? { offset: 0, length: 0 };
  const head = table('head').offset;
  const hhea = table('hhea').offset;
  const hmtx = table('hmtx').offset;
  const units = view.getUint16(head + 18);
  const metrics = view.getUint16(hhea + 34);
  const subtable = unicodeSubtable(view, table('cmap'));
  return {
    ascent: view.getInt16(hhea + 4) / units,
    descent: -view.getInt16(hhea + 6) / units,
    tabular: (char) => {
      const glyph = featureGlyph(view, table('GSUB'), 'tnum', glyphOf(view, subtable, char));
      return view.getUint16(hmtx + 4 * Math.min(glyph, metrics - 1)) / units;
    },
  };
};

/** The `cmap` subtable a reader of Unicode uses: Windows' full repertoire (format 12), else its BMP (format 4). */
const unicodeSubtable = (view: DataView, table: Table) => {
  const count = view.getUint16(table.offset + 2);
  const found = new Map<string, number>();
  for (let index = 0; index < count; index++) {
    const at = table.offset + 4 + 8 * index;
    const key = `${view.getUint16(at)}.${view.getUint16(at + 2)}`;
    found.set(key, table.offset + view.getUint32(at + 4));
  }
  return found.get('3.10') ?? found.get('3.1') ?? found.get('0.4') ?? found.get('0.3') ?? -1;
};

/** What a font file says of itself: its family, its typographic family, its version, and whether it draws a character. */
export interface FontFacts {
  readonly family: string;
  readonly typographic: string;
  readonly version: string;
  readonly draws: (char: string) => boolean;
}

/** The facts of the font file `bytes`. */
export const fontFacts = (bytes: Uint8Array): FontFacts => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = tablesOf(view);
  const name = tables.get('name') ?? { offset: 0, length: 0 };
  const cmap = tables.get('cmap') ?? { offset: 0, length: 0 };
  const subtable = unicodeSubtable(view, cmap);
  return {
    family: nameOf(view, name, 1),
    typographic: nameOf(view, name, 16),
    version: nameOf(view, name, 5),
    draws: (char) => glyphOf(view, subtable, char) !== 0,
  };
};
