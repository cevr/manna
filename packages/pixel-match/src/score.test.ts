/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noTernary -- the port's scoring reads its pictures and the reference's metadata from disk: the test lays a synthetic pair out in a scratch folder of its own, removed once read. */
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';

import type { Cell, Row } from './model.ts';
import { refFile, shotFiles } from './paths.ts';
import { encodePng, type Picture } from './png.ts';
import { scoreShot } from './score.ts';

const scratch = mkdtempSync(`${tmpdir()}/pixel-shot-`);

const frame = { root: scratch, refs: `${scratch}/ref`, one: 'synthetic' };

/** A picture 4 pixels wide whose row `y` is grey `shade(y)`, opaque. */
const striped = (height: number, shade: (y: number) => number): Picture => ({
  width: 4,
  height,
  rgba: Uint8Array.from({ length: 4 * height * 4 }, (_, i) =>
    i % 4 === 3 ? 255 : shade(Math.floor(i / 16)),
  ),
});

/** The agent's `--json` replies, shaped as the iOS agent prints them: a tap, `layout band` and the whole-tree `layout` (in points), the screenshot's. The screen's band runs from `band`'s foot (2 pt) to the foot of `scroll`'s scrollport (4 pt). */
const agentOut = [
  '{"ok":true,"op":"tap"}',
  '{"node":{"absolute":{"x":0,"y":0,"w":1.3,"h":2},"props":{"testId":"band"}}}',
  '{"nodes":[{"id":5,"testId":"tabs","x":0,"y":0,"w":0,"h":0},{"id":9,"testId":"scroll","x":0,"y":2,"w":1.3,"h":3,"port":[0,2,1.3,2]}]}',
  '{"ok":true,"compare":"no box differs"}',
].join('\n');

const cell: Cell = {
  app: 'heartseed',
  host: 'ios',
  id: 'home.synthetic',
  scheme: 'light',
  size: 'large',
};

const row: Row = {
  id: 'home.synthetic',
  unit: 'pm-harness',
  kind: 'match',
  one: { steps: [], band: { targets: ['id=greeting'], edge: 'top' } },
  exact: { ops: ['tap x'], band: { top: 'band', bottom: 'scroll' } },
};

describe("the port's banded scoring, from the agent's replies to the result", () => {
  test("a reference banded under One's header against a screen banded between the bars, from the bar's foot to the tab bar's top, scores the shared rows only", () => {
    const content = (y: number) => 40 + y * 10;
    const reference = striped(12, (y) => (y < 3 ? 250 : content(y - 3)));
    const screen = striped(15, (y) => (y < 6 || y >= 12 ? 5 : content(y - 6)));
    screen.rgba[(8 * 4 + 1) * 4 + 2] = 255;
    mkdirSync(dirname(refFile(frame, cell)), { recursive: true });
    writeFileSync(refFile(frame, cell), encodePng(reference));
    writeFileSync(
      refFile(frame, cell).replace(/\.png$/, '.json'),
      JSON.stringify({ hour: 11, band: { top: 3 } }),
    );
    const files = shotFiles(frame.root, cell);
    mkdirSync(dirname(files.screen), { recursive: true });
    writeFileSync(files.screen, encodePng(screen));

    const noRects = () => scoreShot(frame, row, cell, '{"ok":true}\n{"ok":true}\n{"ok":true}');
    expect(noRects).toThrow("the band's edges are not in the agent's layout replies");
    const result = scoreShot(frame, row, cell, agentOut);
    const written = JSON.parse(readFileSync(files.result, 'utf8')).differing;
    rmSync(scratch, { recursive: true, force: true });

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
});
