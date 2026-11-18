/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noThrowStatement, effect/noNewError, effect/noNullish, effect/noTernary, effect/noAs -- a host tool's scoring: it reads the pictures and the reference's metadata on disk and writes the result files, plain TypeScript as the exact-kit's drives are; a pair of two sizes is a broken shot, said by a throw. */

/**
 * The port's screen of a cell scored against its One reference, once the
 * agent has taken it (`shot.ts`): a banded row over its two bands, else the
 * whole pictures, at the threshold's channel, with the count at channel 0,
 * 4, 8 and 16, the diff picture and Exact's `compare` text written beside
 * the screen.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { Option } from 'effect';

import { agentBand } from './agent-band.ts';
import { diffPicture, ladder, scorePair, type Band, type Banding, type Mask } from './diff.ts';
import { cellName, IOS, type Cell, type MaskSpec, type Row } from './model.ts';
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

/** Masks in points as device pixels. */
const pixelsOf = (masks: ReadonlyArray<MaskSpec>, scale: number): ReadonlyArray<Mask> =>
  masks.map((mask) => ({
    x: mask.x * scale,
    y: mask.y * scale,
    width: mask.width * scale,
    height: mask.height * scale,
    reason: mask.reason,
  }));

/**
 * What a reference's metadata gives the port's side: its band (its top read
 * from One's tree at capture, to the picture's foot; none for a row not
 * banded) and its hour and zone, for the agent's clock.
 */
export const referenceOf = (frame: Frame, cell: Cell) => {
  const metadata = JSON.parse(
    readFileSync(refFile(frame, cell).replace(/\.png$/, '.json'), 'utf8'),
  ) as {
    readonly band?: { readonly top: number };
    readonly hour: number;
    readonly timeZone?: string;
  };
  const band: Band | undefined =
    metadata.band === undefined
      ? undefined
      : { top: metadata.band.top, bottom: Number.POSITIVE_INFINITY };
  return { band, taken: { hour: metadata.hour, timeZone: metadata.timeZone } };
};

/**
 * Scores the port's screen of `cell`, already on disk, against its
 * reference, given the agent's `--json` output `out` of the drive that took
 * it. The result, also written beside the screen with the diff picture.
 */
export const scoreShot = (frame: Frame, row: Row, cell: Cell, out: string) => {
  const oneBand = referenceOf(frame, cell).band;
  const compare = out.trim().split('\n').slice(-12).join('\n');
  let bands: Banding | undefined;
  if (oneBand !== undefined) {
    const side = row.exact?.band;
    const screenBand =
      side === undefined ? undefined : Option.getOrUndefined(agentBand(out, side, IOS.scale));
    if (screenBand === undefined)
      throw new Error(
        `${row.id}: the band's edges are not in the agent's layout replies (${side?.top}'s box, ${side?.bottom}'s port): ${out.trim().split('\n').slice(-3, -1).join(' | ').slice(0, 400)}`,
      );
    bands = { reference: oneBand, screen: screenBand, anchor: row.anchor ?? 'top' };
  }
  const masks = pixelsOf([...(row.one?.masks ?? []), ...(row.exact?.masks ?? [])], IOS.scale);
  const files = shotFiles(frame.root, cell);
  const { reference, screen, laid, picture, scored } = scorePair(
    decodePng(readFileSync(refFile(frame, cell)), 'reference'),
    decodePng(readFileSync(files.screen), 'screen'),
    masks,
    CHANNEL,
    bands,
  );
  if (scored._tag === 'Sizes')
    throw new Error(`${cellName(cell)}: reference ${scored.reference}, screen ${scored.screen}`);
  writeFileSync(files.diff, encodePng(diffPicture(reference, screen, scored)));
  const result = {
    channel: scored.channel,
    scored: scored.scored,
    differing: scored.differing,
    largest: scored.largest,
    masked: scored.masked,
    total: scored.total,
    picture,
    bands,
    ladder: ladder(reference, screen, laid, [0, 4, 8, 16]),
    masks: masks.map((mask) => mask.reason),
    diff: files.diff,
    compare,
  };
  writeFileSync(files.result, `${JSON.stringify(result, null, 2)}\n`);
  return result;
};
