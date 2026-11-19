/* oxlint-disable effect/noNodeBuiltinImport -- a host tool's file names, joined as the tool's other modules read and write them through node's file system. */

/**
 * Where the harness keeps what it makes. References:
 * `$PIXEL_REF/<one>/<app>/<host>/<id>/<scheme>-<size or viewport>.png`
 * (default `tmp/pixel-match/ref` in the checkout), never committed: they
 * hold hymn and verse words. A port's screens and their results:
 * `tmp/pixel-match/shots/…` beside the report, `tmp/pixel-match/report.json`.
 */
import { join } from 'node:path';

import type { Cell } from './model.ts';

/** The tail of a cell's files: `<app>/<host>/<id>/<scheme>-<size>`. */
const cellPath = (cell: Cell) => join(cell.app, cell.host, cell.id, `${cell.scheme}-${cell.size}`);

/** A cell's reference picture. */
export const refFile = (frame: { readonly refs: string; readonly one: string }, cell: Cell) =>
  join(frame.refs, frame.one, `${cellPath(cell)}.png`);

/** A cell's port screen, its diff picture and its result, under the checkout's `tmp/pixel-match/shots`. */
export const shotFiles = (root: string, cell: Cell) => {
  const base = join(root, 'tmp', 'pixel-match', 'shots', cellPath(cell));
  return {
    screen: `${base}.png`,
    diff: `${base}.diff.png`,
    result: `${base}.json`,
    log: `${base}.log`,
  };
};

export const reportFile = (root: string) => join(root, 'tmp', 'pixel-match', 'report.json');
