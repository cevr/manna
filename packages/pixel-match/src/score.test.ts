/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noTernary, effect/noNullish, effect/noTestLifecycleHooks -- the port's scoring reads its pictures and the reference's metadata from disk: the test lays synthetic pairs out in a scratch folder of its own, removed after the file's tests whether they pass or fail; a row's optional sides are given or not. */
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';

import type { Cell, Row } from './model.ts';
import { refFile, shotFiles } from './paths.ts';
import { encodePng, type Picture } from './png.ts';
import { scoreShot } from './score.ts';

const scratch = mkdtempSync(`${tmpdir()}/pixel-shot-`);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const frame = { root: scratch, refs: `${scratch}/ref`, one: 'synthetic' };

/** A picture 4 pixels wide whose row `y` is grey `shade(y)`, opaque. */
const striped = (height: number, shade: (y: number) => number): Picture => ({
  width: 4,
  height,
  rgba: Uint8Array.from({ length: 4 * height * 4 }, (_, i) =>
    i % 4 === 3 ? 255 : shade(Math.floor(i / 16)),
  ),
});

/** `picture` with the blue of the pixel at (`x`, `y`) set to 255. */
const marked = (picture: Picture, x: number, y: number): Picture => {
  const rgba = Uint8Array.from(picture.rgba);
  rgba[(y * picture.width + x) * 4 + 2] = 255;
  return { ...picture, rgba };
};

/** The agent's `--json` output: a tap, the given replies, the screenshot's. */
const agent = (...replies: ReadonlyArray<string>) =>
  ['{"ok":true,"op":"tap"}', ...replies, '{"ok":true,"compare":"no box differs"}'].join('\n');

/** `layout band` and the whole-tree `layout`, in points: the screen's band runs from `band`'s foot (2 pt) to the foot of `scroll`'s scrollport (4 pt). */
const BAND_REPLIES = [
  '{"node":{"absolute":{"x":0,"y":0,"w":1.3,"h":2},"props":{"testId":"band"}}}',
  '{"nodes":[{"id":5,"testId":"tabs","x":0,"y":0,"w":0,"h":0},{"id":9,"testId":"scroll","x":0,"y":2,"w":1.3,"h":3,"port":[0,2,1.3,2]}]}',
];

const cellOf = (id: string, host: Cell['host'] = 'ios'): Cell => ({
  app: host === 'web' ? 'hymnal' : 'heartseed',
  host,
  id,
  scheme: 'light',
  size: host === 'web' ? '390x844@2' : 'large',
});

/** Lays a reference (with its metadata) and a screen on disk for `cell`. */
const lay = (
  cell: Cell,
  reference: Picture,
  screen: Picture,
  metadata: {
    readonly hour?: number;
    readonly band?: { readonly top: number };
    readonly keyboard?: number;
  },
) => {
  mkdirSync(dirname(refFile(frame, cell)), { recursive: true });
  writeFileSync(refFile(frame, cell), encodePng(reference));
  writeFileSync(refFile(frame, cell).replace(/\.png$/, '.json'), JSON.stringify(metadata));
  const files = shotFiles(frame.root, cell);
  mkdirSync(dirname(files.screen), { recursive: true });
  writeFileSync(files.screen, encodePng(screen));
  return files;
};

/** Scores a laid pair as `pixel shot` does, an iOS cell's text size read back as the cell's own. */
const shot = (row: Row, cell: Cell, out: string) =>
  scoreShot(frame, row, cell, out, cell.host === 'ios' ? cell.size : undefined);

const banded: Row = {
  id: 'home.synthetic',
  unit: 'pm-harness',
  kind: 'match',
  one: { steps: [], band: { targets: ['id=greeting'], edge: 'top' } },
  exact: { ops: ['tap x'], band: { top: 'band', bottom: 'scroll' } },
};

/** A reference banded under One's header (rows 3 to 12) and a screen banded between the bars (rows 6 to 12), whose content is the reference's band's last six rows: laid at their feet they agree, laid at their tops they do not. */
const content = (y: number) => 40 + y * 10;
const REFERENCE = striped(12, (y) => (y < 3 ? 250 : content(y - 3)));
const SCREEN = striped(15, (y) => (y < 6 || y >= 12 ? 5 : content(y - 3)));

describe("the port's scoring, from the agent's replies to the result", () => {
  test('an iOS shot taken at another text size than its cell, or at an unread one, is refused, and the size is recorded', () => {
    const cell = cellOf('home.sized');
    const page = striped(4, content);
    const files = lay(cell, page, page, { hour: 11 });
    const row: Row = { id: 'home.sized', unit: 'pm-harness', kind: 'match', one: { steps: [] } };
    const sided = { ...row, exact: { ops: [] } };
    expect(() =>
      scoreShot(frame, sided, cell, agent(), 'accessibility-extra-extra-extra-large'),
    ).toThrow("shot at text size accessibility-extra-extra-extra-large, not the cell's large");
    expect(() => scoreShot(frame, sided, cell, agent())).toThrow('text size unread');
    expect(scoreShot(frame, sided, cell, agent(), 'large').contentSize).toBe('large');
    expect(JSON.parse(readFileSync(files.result, 'utf8')).contentSize).toBe('large');
  });

  test("a reference banded under One's header against a screen banded between the bars, from the bar's foot to the tab bar's top, scores the shared rows only", () => {
    const cell = cellOf('home.synthetic');
    const screen = marked(
      striped(15, (y) => (y < 6 || y >= 12 ? 5 : content(y - 6))),
      2,
      8,
    );
    const files = lay(cell, REFERENCE, screen, { hour: 11, band: { top: 3 } });

    const noRects = () => shot(banded, cell, agent('{"ok":true}', '{"ok":true}'));
    expect(noRects).toThrow("the band's edges are not in the agent's replies");
    const result = shot(banded, cell, agent(...BAND_REPLIES));
    const written = JSON.parse(readFileSync(files.result, 'utf8')).differing;

    expect([result.picture, result.total, result.differing, result.largest]).toEqual([
      48, 24, 1, 1,
    ]);
    expect(result.bands).toEqual({
      reference: { top: 3, bottom: Number.POSITIVE_INFINITY },
      screen: { top: 6, bottom: 12 },
      anchor: 'top',
    });
    expect(result.compare).toContain('no box differs');
    expect(written).toBe(1);
  });

  test('a row anchored at the bottom lays the two bands at their feet, not their tops', () => {
    const cell = cellOf('home.foot');
    lay(cell, REFERENCE, SCREEN, { hour: 11, band: { top: 3 } });
    const score = (anchor: Row['anchor']) =>
      shot({ ...banded, id: 'home.foot', anchor }, cell, agent(...BAND_REPLIES));
    expect(score('bottom').differing).toBe(0);
    expect(score('bottom').bands?.anchor).toBe('bottom');
    expect(score(undefined).differing).toBe(24);
  });

  test("the port's own masks are laid over its pair, as One's are", () => {
    const cell = cellOf('home.masked');
    lay(cell, REFERENCE, marked(SCREEN, 1, 10), { hour: 11, band: { top: 3 } });
    const row = (masks: ReadonlyArray<{ readonly y: number }>): Row => ({
      ...banded,
      id: 'home.masked',
      anchor: 'bottom',
      exact: {
        ops: [],
        band: { top: 'band', bottom: 'scroll' },
        masks: masks.map((mask) => ({ x: 0, y: mask.y, width: 1, height: 1, reason: 'drawn' })),
      },
    });
    const bare = shot(row([]), cell, agent(...BAND_REPLIES));
    const over = shot(row([{ y: 3 }]), cell, agent(...BAND_REPLIES));
    expect([bare.differing, bare.masked]).toEqual([1, 0]);
    expect([over.differing, over.masked, over.masks]).toEqual([0, 9, ['drawn']]);
  });

  test('a keyboard row is scored from the top to the keyboard, on each side read at capture', () => {
    const cell = { ...cellOf('find.synthetic'), app: 'hymnal' as const };
    const reference = striped(12, (y) => (y < 9 ? content(y) : 250));
    const screen = marked(
      striped(12, (y) => (y < 6 ? content(y) : 5)),
      0,
      10,
    );
    lay(cell, reference, screen, { hour: 11, keyboard: 9 });
    const row: Row = {
      id: 'find.synthetic',
      unit: 'pm-harness',
      kind: 'match',
      keyboard: true,
      one: { steps: [] },
      exact: { ops: [] },
    };
    const up = '{"visible":true,"overlap":1,"top":2}';
    const result = shot(row, cell, agent(up));
    expect([result.picture, result.total, result.differing, result.masked]).toEqual([48, 24, 0, 0]);
    expect(result.bands?.screen).toEqual({ top: 0, bottom: 6 });
    expect(() => shot(row, cell, agent('{"visible":false}'))).toThrow(
      "the band's edges are not in the agent's replies",
    );
    lay(cell, reference, screen, { hour: 11 });
    expect(() => shot(row, cell, agent(up))).toThrow('keeps no keyboard top');
  });

  test("a web cell lays only the port's web masks, at the viewport's scale, never the iOS masks", () => {
    const cell = cellOf('home.web', 'web');
    const page = striped(4, content);
    lay(cell, page, marked(page, 3, 3), {});
    const ios = [{ x: 0, y: 0, width: 2, height: 2, reason: 'iOS points' }];
    const row = (web: boolean): Row => ({
      id: 'home.web',
      unit: 'pm-harness',
      kind: 'match',
      one: { steps: [], masks: ios },
      exact: {
        ops: [],
        masks: ios,
        web: web ? { masks: [{ x: 1, y: 1, width: 1, height: 1, reason: 'web' }] } : undefined,
      },
    });
    const bare = shot(row(false), cell, agent());
    const masked = shot(row(true), cell, agent());
    expect([bare.differing, bare.masked, bare.total]).toEqual([1, 0, 16]);
    expect([masked.differing, masked.masked, masked.masks]).toEqual([0, 4, ['web']]);
  });
});
