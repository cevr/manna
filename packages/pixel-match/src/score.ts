/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noThrowStatement, effect/noNewError, effect/noNullish, effect/noTernary, effect/noAs -- a host tool's scoring: it reads the pictures and the reference's metadata on disk and writes the result files, plain TypeScript as the exact-kit's drives are; a pair of two sizes is a broken shot, said by a throw. */

/**
 * The port's screen of a cell scored against its One reference, once the
 * agent has taken it (`shot.ts`): a banded row (Heartseed's bars, or the
 * keyboard) over its two bands, else the whole pictures, at the
 * threshold's channel, with the count at channel 0, 4, 8 and 16, the diff
 * picture and Exact's `compare` text written beside the screen.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { Option } from 'effect';

import { agentBand } from './agent-band.ts';
import { diffPicture, ladder, scorePair, type Band, type Banding, type Mask } from './diff.ts';
import { cellName, IOS, viewportOf, type Cell, type MaskSpec, type Row } from './model.ts';
import { refFile, shotFiles } from './paths.ts';
import { decodePng, encodePng } from './png.ts';

/** Where the checkout and the references are. */
export interface Frame {
  readonly root: string;
  readonly refs: string;
  readonly one: string;
}

/** The channel limit a pair is scored at: `accept.ts`'s. */
const CHANNEL = 16;

/** Masks in points (iOS) or CSS pixels (the web) as device pixels. */
const pixelsOf = (masks: ReadonlyArray<MaskSpec>, scale: number): ReadonlyArray<Mask> =>
  masks.map((mask) => ({
    x: mask.x * scale,
    y: mask.y * scale,
    width: mask.width * scale,
    height: mask.height * scale,
    reason: mask.reason,
  }));

/** Device pixels a point (iOS) or a CSS pixel (the cell's viewport) in a cell's pictures. */
const scaleOf = (cell: Cell) => (cell.host === 'web' ? viewportOf(cell.size).scale : IOS.scale);

/** A cell's masks: on iOS the One side's and the port's, on the web the port's web masks only (iOS points mean nothing on a web page). */
const masksOf = (row: Row, cell: Cell) =>
  pixelsOf(
    cell.host === 'web'
      ? (row.exact?.web?.masks ?? [])
      : [...(row.one?.masks ?? []), ...(row.exact?.masks ?? [])],
    scaleOf(cell),
  );

/** Whether a cell is scored over the keyboard's band: a keyboard row's iOS cell. */
const keyboardCell = (row: Row, cell: Cell) => row.keyboard === true && cell.host === 'ios';

/**
 * What a reference's metadata gives the port's side: its band (its top read
 * from One's tree at capture, to the keyboard's top for a keyboard row or
 * else the picture's foot; none for a row not banded) and its hour and
 * zone, for the agent's clock.
 */
export const referenceOf = (frame: Frame, cell: Cell) => {
  const metadata = JSON.parse(
    readFileSync(refFile(frame, cell).replace(/\.png$/, '.json'), 'utf8'),
  ) as {
    readonly band?: { readonly top: number };
    readonly keyboard?: number;
    readonly hour?: number;
    readonly timeZone?: string;
  };
  const band: Band | undefined =
    metadata.band === undefined && metadata.keyboard === undefined
      ? undefined
      : {
          top: metadata.band?.top ?? 0,
          bottom: metadata.keyboard ?? Number.POSITIVE_INFINITY,
        };
  return {
    band,
    keyboard: metadata.keyboard,
    taken: { hour: metadata.hour ?? 0, timeZone: metadata.timeZone },
  };
};

/**
 * Scores the port's screen of `cell`, already on disk, against its
 * reference, given the agent's `--json` output `out` of the drive that took
 * it, and for an iOS cell the simulator's text size read back after the
 * drive (`contentSize`): a shot taken at another size than the cell's is
 * refused, since a size left on the shared simulator by an earlier run
 * would score a different screen. The result, recording that size, is
 * also written beside the screen with the diff picture.
 */
export const scoreShot = (
  frame: Frame,
  row: Row,
  cell: Cell,
  out: string,
  contentSize?: string,
) => {
  if (cell.host === 'ios' && contentSize !== cell.size)
    throw new Error(
      `${cellName(cell)}: the port was shot at text size ${contentSize ?? 'unread'}, not the cell's ${cell.size}`,
    );
  const reference = referenceOf(frame, cell);
  const compare = out.trim().split('\n').slice(-12).join('\n');
  const keyboard = keyboardCell(row, cell);
  if (keyboard && reference.keyboard === undefined)
    throw new Error(
      `${cellName(cell)}: a keyboard row whose reference keeps no keyboard top: take it again`,
    );
  let bands: Banding | undefined;
  if (reference.band !== undefined) {
    const side = row.exact?.band;
    const edges = { band: side, keyboard };
    const screenBand = Option.getOrUndefined(agentBand(out, edges, scaleOf(cell)));
    if (screenBand === undefined)
      throw new Error(
        `${row.id}: the band's edges are not in the agent's replies (${side === undefined ? '' : `${side.top}'s box, ${side.bottom}'s port`}${keyboard ? ', the keyboard' : ''}): ${out.trim().split('\n').slice(-4, -1).join(' | ').slice(0, 400)}`,
      );
    bands = { reference: reference.band, screen: screenBand, anchor: row.anchor ?? 'top' };
  }
  const masks = masksOf(row, cell);
  const files = shotFiles(frame.root, cell);
  const pair = scorePair(
    decodePng(readFileSync(refFile(frame, cell)), 'reference'),
    decodePng(readFileSync(files.screen), 'screen'),
    masks,
    CHANNEL,
    bands,
  );
  const { scored } = pair;
  if (scored._tag === 'Sizes')
    throw new Error(`${cellName(cell)}: reference ${scored.reference}, screen ${scored.screen}`);
  writeFileSync(files.diff, encodePng(diffPicture(pair.reference, pair.screen, scored)));
  const result = {
    channel: scored.channel,
    scored: scored.scored,
    differing: scored.differing,
    largest: scored.largest,
    masked: scored.masked,
    total: scored.total,
    picture: pair.picture,
    contentSize,
    bands,
    ladder: ladder(pair.reference, pair.screen, pair.laid, [0, 4, 8, 16]),
    masks: masks.map((mask) => mask.reason),
    diff: files.diff,
    compare,
  };
  writeFileSync(files.result, `${JSON.stringify(result, null, 2)}\n`);
  return result;
};
