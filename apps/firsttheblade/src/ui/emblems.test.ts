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
      expect(turned.indexOf('d="M24 15c-5-3')).toBeLessThan(from);
      expect(from).toBeLessThan(turned.indexOf('<path d="M24 15v25"/>'));
    }));

  test('the leaf is the right page and its lines, the book’s own strokes', () =>
    Effect.gen(function* () {
      const book = yield* read('../art/emblem-taught.svg');
      const turned = withLeaf(book);
      const from = turned.indexOf('<g class="leaf">');
      const leaf = turned.slice(from, turned.indexOf('</g>', from));
      // The right page, from the spine's head round to its foot: the book's outline's right half.
      const page = 'M24 15c5-3 12-3.5 18-1.5v25c-6-2-13-1.5-18 1.5z';
      const lines = 'M28 20.5c3-1.3 7-1.3 10-.5M28 25.5c3-1.3 7-1.3 10-.5';
      // The book draws both pages' lines as one path; the right page's are its second half.
      expect(book).toContain(`${lines}"`);
      expect(ds(leaf)).toEqual([page, lines]);
      expect(leaf).not.toContain('fill');
    }));

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
