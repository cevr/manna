/* oxlint-disable effect/noThrowStatement, effect/noNewError, effect/noNullish, effect/noTernary -- a row with no Exact side is no shot, said by a throw; its web ops and its touch are given or not. */

/**
 * The agent's command lines for a port's cell (`pixel shot`), as data so a
 * test reads them whole.
 *
 * iOS: `bun run exact agent ios` at the reference's scale, on the agent's
 * clock at the reference's hour, on the store `seedPlan` readied
 * (`storageFlags`), with real touches where the row asks for them (`touch: 'platform'`,
 * Exact's `--touch platform`: a drag then moves UIKit's own sheet to a
 * detent), the cell's scheme preferred, the row's ops, the band's and the
 * keyboard's replies, then the window taken with Exact's `compare`.
 *
 * Web: the port's web build in the agent's own Chromium (`bun run exact
 * agent web`, launched with `--use-mock-keychain --password-store=basic`)
 * at the reference's viewport (`--size`) and device scale (`EXACT_SCALE`,
 * Chrome's own scale factor, never CDP's emulated one), the cell's scheme
 * preferred, on the store `webSeedOf` readied (the fixture's states read
 * back first), the row's web ops (else its iOS ops), then the screen taken
 * with Exact's `compare` against the reference.
 */

import { edgeOps } from './agent-band.ts';
import { IOS, viewportOf, type Cell, type Row } from './model.ts';

/** The row's Exact side, or a throw: a row with none has no shot. */
const sideOfRow = (row: Row) => {
  const side = row.exact;
  if (side === undefined) throw new Error(`${row.id}: no Exact side written yet`);
  return side;
};

/** The agent's command line for an iOS cell. */
export const iosCommand = (
  row: Row,
  cell: Cell,
  files: { readonly screen: string; readonly reference: string },
  clock: { readonly epoch: number; readonly timeZone: string },
  storage: ReadonlyArray<string>,
) => {
  const side = sideOfRow(row);
  return [
    'bun',
    'run',
    'exact',
    'agent',
    'ios',
    '--json',
    '--scale',
    String(IOS.scale),
    '--epoch',
    String(clock.epoch),
    '--time-zone',
    clock.timeZone,
    ...(side.touch === 'platform' ? ['--touch', 'platform'] : []),
    ...storage,
    `prefer prefers-color-scheme ${cell.scheme}`,
    'clock settle',
    ...side.ops,
    'clock settle',
    ...edgeOps({ band: side.band, keyboard: row.keyboard === true }),
    `screenshot ${files.screen} window compare ${files.reference}`,
  ];
};

/**
 * The agent's command line and environment for a web cell, on the store
 * its storage flags name; each state in `readBack` is read once the page
 * has settled, before the row's ops can change it, so the shot can prove
 * its fixture reached the page.
 */
export const webCommand = (
  row: Row,
  cell: Cell,
  files: { readonly screen: string; readonly reference: string },
  storage: ReadonlyArray<string>,
  readBack: ReadonlyArray<string> = [],
) => {
  const side = sideOfRow(row);
  const viewport = viewportOf(cell.size);
  const { screen, reference } = files;
  return {
    argv: [
      'bun',
      'run',
      'exact',
      'agent',
      'web',
      '--json',
      '--size',
      `${viewport.width}x${viewport.height}`,
      ...storage,
      `prefer prefers-color-scheme ${cell.scheme}`,
      'clock settle',
      ...readBack.map((name) => `state ${name}`),
      ...(side.web?.ops ?? side.ops),
      'clock settle',
      `screenshot ${screen} compare ${reference}`,
    ],
    env: { EXACT_SCALE: String(viewport.scale) },
  };
};
