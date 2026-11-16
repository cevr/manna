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

/** Whether a format 4 subtable maps `code` to a glyph other than the missing one. */
const drawsIn4 = (view: DataView, at: number, code: number) => {
  const segments = view.getUint16(at + 6) / 2;
  const ends = at + 14;
  const starts = ends + 2 * segments + 2;
  const deltas = starts + 2 * segments;
  const ranges = deltas + 2 * segments;
  for (let segment = 0; segment < segments; segment++) {
    if (view.getUint16(ends + 2 * segment) < code) continue;
    const start = view.getUint16(starts + 2 * segment);
    if (start > code) return false;
    const delta = view.getUint16(deltas + 2 * segment);
    const range = view.getUint16(ranges + 2 * segment);
    if (range === 0) return ((code + delta) & 0xffff) !== 0;
    const glyph = view.getUint16(ranges + 2 * segment + range + 2 * (code - start));
    return glyph !== 0 && ((glyph + delta) & 0xffff) !== 0;
  }
  return false;
};

/** Whether a format 12 subtable maps `code` to a glyph other than the missing one. */
const drawsIn12 = (view: DataView, at: number, code: number) => {
  const groups = view.getUint32(at + 12);
  for (let group = 0; group < groups; group++) {
    const entry = at + 16 + 12 * group;
    const start = view.getUint32(entry);
    if (code >= start && code <= view.getUint32(entry + 4))
      return view.getUint32(entry + 8) + (code - start) !== 0;
  }
  return false;
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
  const format = subtable >= 0 && view.getUint16(subtable);
  return {
    family: nameOf(view, name, 1),
    typographic: nameOf(view, name, 16),
    version: nameOf(view, name, 5),
    draws: (char) => {
      const code = char.codePointAt(0) ?? 0;
      if (format === 12) return drawsIn12(view, subtable, code);
      if (format === 4) return code <= 0xffff && drawsIn4(view, subtable, code);
      return false;
    },
  };
};
