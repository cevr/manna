/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noTernary -- the port's scoring reads its pictures and the reference's metadata from disk: the test lays a synthetic pair out in a scratch folder of its own, removed once read. */
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';

import type { Cell, Row } from './model.ts';
import { refFile, shotFiles } from './paths.ts';
import { encodePng, type Picture } from './png.ts';
import { edgesIn, scoreShot } from './shot.ts';

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

/** The agent's `--json` replies: a tap, the two `layout` replies (in points), the screenshot's. */
const agentOut = [
  '{"ok":true,"op":"tap"}',
  '{"ok":true,"node":{"id":"bar","frame":{"x":0,"y":0,"width":1.3,"height":2}}}',
  '{"ok":true,"node":{"id":"tabs","frame":{"x":0,"y":4,"width":1.3,"height":1}}}',
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
  exact: { ops: ['tap x'], band: { top: 'bar', bottom: 'tabs' } },
};

describe("the port's banded scoring, from the agent's replies to the result", () => {
  test("the two layout replies are the band between the bar's foot and the tab bar's top, in device pixels", () => {
    expect(edgesIn(agentOut)).toEqual({ top: 6, bottom: 12 });
    expect(edgesIn('{"ok":true}\n{"ok":true}\n{"ok":true}')).toBeUndefined();
  });

  test("a reference banded under One's header against a screen banded between the bars scores the shared rows only", () => {
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
