import { BunServices } from '@effect/platform-bun';
import { test as plain } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path } from 'effect';

import { PALETTE } from '../palette.ts';
import { withLeaf } from './emblems.ts';

const test = it.effect.layer(BunServices.layer);

const read = (file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* fs.readFileString(path.join(import.meta.dir, file));
  });

const EMBLEMS = ['path', 'land', 'taught', 'remedies'] as const;

/** Every `d` a drawing names, in order. */
const ds = (svg: string) => Array.from(svg.matchAll(/ d="([^"]+)"/g), (found) => found[1]);

describe('the series marks laid in the page', () => {
  test('the book gains its leaf under the spine, after its pages and before the spine', () =>
    Effect.gen(function* () {
      const book = yield* read('../art/emblem-taught.svg');
      const turned = withLeaf(book);
      const from = turned.indexOf('<g class="leaf">');
      const leaf = turned.slice(from, turned.indexOf('</g>', from) + '</g>'.length);
      expect(from).toBeGreaterThan(-1);
      expect(turned.replace(leaf, '')).toBe(book);
      expect(turned.indexOf('<g class="book-page">')).toBeLessThan(from);
      expect(from).toBeLessThan(turned.indexOf('<g class="book-spine">'));
    }));

  test('the leaf is the right page, its edges and its lines, the book’s own strokes', () =>
    Effect.gen(function* () {
      const book = yield* read('../art/emblem-taught.svg');
      const turned = withLeaf(book);
      const from = turned.indexOf('<g class="leaf">');
      const leaf = turned.slice(from, turned.indexOf('</g>', from));
      const pageFrom = book.indexOf('<g class="book-page">');
      const page = book.slice(pageFrom, book.indexOf('</g>', pageFrom));
      // The right page: its top edge from the spine's head, its outer edge, its foot, and three lines.
      const strokes = new Set(ds(page));
      expect(strokes.size).toBe(6);
      expect(ds(page)[0]).toStartWith('M24 15c5-3');
      expect(ds(leaf)).toEqual(ds(page));
      expect(leaf).not.toContain('fill');
    }));

  plain('a drawing with a page but no spine is left as it is', () => {
    const drawing = '<svg><g class="book-page"><path d="M0 0h1"/></g></svg>';
    expect(withLeaf(drawing)).toBe(drawing);
  });

  plain('a drawing with no spine is left as it is', () => {
    expect(withLeaf('<svg></svg>')).toBe('<svg></svg>');
  });

  test('each mark is drawn in the deep wheat, so it keeps its colour in an img where currentColor is black', () =>
    Effect.gen(function* () {
      for (const id of EMBLEMS) {
        const svg = yield* read(`../art/emblem-${id}.svg`);
        const strokes = Array.from(svg.matchAll(/stroke="([^"]+)"/g), (found) => found[1]);
        expect({ id, strokes }).toEqual({ id, strokes: [PALETTE.accent] });
        expect(svg).not.toContain('currentColor');
      }
    }));
});
