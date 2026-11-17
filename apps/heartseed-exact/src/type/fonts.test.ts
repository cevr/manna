/**
 * The reading fonts as files (spec, acceptance 2 and 3): every bundled key
 * has its Regular, its Italic and its `OFL.txt`; each file is the one
 * `SOURCES.md` records, by its SHA-256 and its length; the files total
 * under 5 MB; `features/type.contract` declares exactly those families and
 * files, Regular and Italic, and each file names the family it is declared
 * as; the family chains, the column's and each tile's, name every one of the
 * eleven keys and nothing else, each with the face the plan gives it; every
 * face draws every character of the KJV the app ships; and About's licences
 * hold each family's OFL text whole, by its length and its fingerprint.
 */

import { describe, expect, it } from 'bun:test';

import { corpus } from '../../tools/kjv';
import { licenceTexts } from '../../tools/licences';
import { readContracts } from '../../tools/look';
import { fontFacts, readFontFile, readFontFolders, readSources, sha256 } from '../../tools/fonts';
import { sumOf } from '../text/sum';
import { TYPE_FONTS } from './choices';

const BUDGET = 5_000_000;

/** The family each key is drawn in first, as the plan's "Fonts" table gives it. */
const FIRST = {
  newyork: 'ui-serif',
  sf: 'system-ui',
  rounded: 'ui-rounded',
  mono: 'ui-monospace',
  literata: 'Literata',
  sourceserif: '"Source Serif 4"',
  merriweather: 'Merriweather',
  lora: 'Lora',
  inter: 'Inter',
  atkinson: '"Atkinson Hyperlegible"',
  opendyslexic: 'OpenDyslexic',
} as const;

const contract = readContracts().get('features/type.contract') ?? '';
const folders = readFontFolders();
const bundled = TYPE_FONTS.filter((font) => font.bundled !== '');

/** Each `font` block of a Contract text: its family, and each face's weight, style and file. */
const declaredFonts = (text: string) =>
  [...text.matchAll(/^font "([^"]+)"\n((?: {2}.*\n?)*)/gmu)].map((match) => ({
    family: match[1] ?? '',
    faces: [...(match[2] ?? '').matchAll(/^ {2}(\d+)( italic)? = "([^"]+)"$/gmu)].map((face) => ({
      weight: Number(face[1]),
      italic: Boolean(face[2]),
      file: face[3] ?? '',
    })),
  }));

/** `SOURCES.md`'s rows: each file's path under `assets/fonts/`, its length and its SHA-256. */
const sourceRows = (text: string) =>
  text
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => line.split('|').map((cell) => cell.trim().replaceAll('`', '')))
    .map(([, , , path = '', , bytes = '', sum = '']) => ({ path, bytes: Number(bytes), sum }));

/** The key the last arm of a chain draws: every key the chain does not name, the default New York among them. */
const DEFAULT_KEY = 'newyork';

/** Each family chain of a Contract text, `<subject> == "<key>" ? "<families>"` arm by arm, its last arm under `DEFAULT_KEY`, by the subject it keys on. */
const chainsOf = (text: string) => {
  const chains = new Map<string, Map<string, string>>();
  for (const line of text.split('\n')) {
    const at = line.indexOf('font-family=(');
    if (at < 0) continue;
    const chain = line.slice(at);
    const arms = [...chain.matchAll(/([\w.]+) == "(\w+)" \? "((?:[^"\\]|\\.)*)"/gu)];
    const subject = arms[0]?.[1] ?? '';
    const keyed = new Map(arms.map((arm) => [arm[2] ?? '', (arm[3] ?? '').replaceAll('\\"', '"')]));
    const last = /: "((?:[^"\\]|\\.)*)"\)+/u.exec(chain.slice(chain.lastIndexOf(' : "')));
    keyed.set(DEFAULT_KEY, (last?.[1] ?? '').replaceAll('\\"', '"'));
    chains.set(subject, keyed);
  }
  return chains;
};

describe('the bundled files', () => {
  it('every bundled key, and no other, has its Regular, its Italic and its OFL.txt', () => {
    expect(folders.map((folder) => folder.key)).toEqual(bundled.map((font) => font.key).toSorted());
    for (const folder of folders) {
      expect([folder.key, folder.files.length]).toEqual([folder.key, 2]);
      expect(folder.licence).toContain('SIL Open Font License, Version 1.1');
    }
  });

  it("each file is SOURCES.md's, by its length and its SHA-256, and SOURCES.md names no other", () => {
    const rows = sourceRows(readSources());
    const files = folders.flatMap((folder) =>
      [...folder.files, 'OFL.txt'].map((file) => `${folder.key}/${file}`),
    );
    expect(rows.map((row) => row.path).toSorted()).toEqual(files.toSorted());
    for (const row of rows) {
      const bytes = readFontFile(row.path);
      expect([row.path, bytes.length, sha256(bytes)]).toEqual([row.path, row.bytes, row.sum]);
    }
  });

  it('the font files total under 5 MB', () => {
    const total = folders
      .flatMap((folder) => folder.files.map((file) => readFontFile(`${folder.key}/${file}`).length))
      .reduce((sum, length) => sum + length, 0);
    expect(total).toBeLessThan(BUDGET);
  });

  it('every face draws every character of the KJV the app ships', () => {
    const characters = new Set([...corpus().join('')].filter((char) => char !== '\n'));
    expect(characters.size).toBeGreaterThan(50);
    for (const folder of folders)
      for (const file of folder.files) {
        const facts = fontFacts(readFontFile(`${folder.key}/${file}`));
        expect([file, [...characters].filter((char) => !facts.draws(char))]).toEqual([file, []]);
      }
  });

  it('the coverage reader tells a drawn character from a missing one', () => {
    const literata = fontFacts(readFontFile('literata/Literata-Regular.ttf'));
    const atkinson = fontFacts(readFontFile('atkinson/AtkinsonHyperlegible-Regular.ttf'));
    expect([
      literata.draws('α'),
      literata.draws('א'),
      atkinson.draws('A'),
      atkinson.draws('α'),
    ]).toEqual([true, false, true, false]);
  });
});

describe('the contract declares the files', () => {
  const declared = declaredFonts(contract);

  it('exactly the bundled families, each its Regular and its Italic at 400', () => {
    expect(declared.map((font) => font.family)).toEqual(bundled.map((font) => font.bundled));
    for (const font of declared)
      expect(font.faces.map((face) => [face.weight, face.italic])).toEqual([
        [400, false],
        [400, true],
      ]);
  });

  it('exactly the files under assets/fonts/, each naming the family it is declared as', () => {
    const files = declared.flatMap((font) => font.faces.map((face) => face.file));
    expect(files.toSorted()).toEqual(
      folders
        .flatMap((folder) => folder.files.map((file) => `assets/fonts/${folder.key}/${file}`))
        .toSorted(),
    );
    for (const font of declared)
      for (const face of font.faces) {
        const facts = fontFacts(readFontFile(face.file.replace('assets/fonts/', '')));
        const family = facts.typographic || facts.family;
        expect([face.file, family]).toEqual([face.file, font.family]);
      }
  });
});

describe('the family chains', () => {
  const chains = chainsOf(contract);

  it("the column's and each tile's, keyed on the font", () => {
    expect([...chains.keys()].toSorted()).toEqual(['f.value', 'type.font']);
  });

  for (const [subject, chain] of chains)
    it(`${subject}: names every one of the eleven keys and nothing else, each its face first`, () => {
      expect([...chain.keys()].toSorted()).toEqual(Object.keys(FIRST).toSorted());
      const firsts = Object.fromEntries(
        [...chain].map(([key, families]) => [key, families.split(', ')[0]]),
      );
      expect(firsts).toEqual(FIRST);
      expect(chain.get(DEFAULT_KEY)).toBe('ui-serif, Georgia, serif');
    });

  it('finds a key missing from a chain', () => {
    const planted = chainsOf(
      '    column font-family=(type.font == "sf" ? "system-ui" : (type.font == "lora" ? "Lora" : "ui-serif, Georgia, serif"))\n',
    );
    expect([...(planted.get('type.font')?.keys() ?? [])]).toEqual(['sf', 'lora', DEFAULT_KEY]);
  });
});

describe("About's licences", () => {
  const texts = licenceTexts();
  for (const folder of folders)
    it(`hold ${folder.key}'s OFL text whole`, () => {
      const ofl = folder.licence;
      const holding = texts.filter(
        (text) => text.length > ofl.length && sumOf(text.slice(-ofl.length)) === sumOf(ofl),
      );
      expect(holding.map((text) => text.slice(-ofl.length).length)).toEqual([ofl.length]);
    });
});
