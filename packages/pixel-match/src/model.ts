/**
 * The inventory as code: one `Row` per state of a screen, with the steps
 * that reach it in the One app (and, once its unit writes them, in the
 * port), its fixture and its masks. A row's cells are its matrix: light and
 * dark at the default text size, the swept sizes in light for a `sweep`
 * row, and on the web each viewport in each scheme for an app the web
 * draws. A cell is named `<app>/<host>/<id>/<scheme>/<size or viewport>`,
 * as `accept.ts` names it.
 */

export type AppName = 'heartseed' | 'hymnal';

type Host = 'ios' | 'web';

type Scheme = 'light' | 'dark';

/** The iOS matrix: the inventory's `matrix.ios`. */
export const IOS = {
  schemes: ['light', 'dark'],
  size: 'large',
  sweepSizes: ['extra-small', 'extra-extra-extra-large', 'accessibility-extra-extra-extra-large'],
  sweepScheme: 'light',
  /** Device pixels a point on the iPhone 17. */
  scale: 3,
} as const;

/** The web matrix: the inventory's `matrix.web`. */
export const WEB = {
  viewports: ['390x844@2', '1280x800@1'],
  schemes: ['light', 'dark'],
} as const;

/** Where each app is drawn. */
const HOSTS: Readonly<Record<AppName, ReadonlyArray<Host>>> = {
  heartseed: ['ios'],
  hymnal: ['ios', 'web'],
};

/** The hosts `app` is drawn on. */
export const hostsOf = (app: AppName) => HOSTS[app];

/**
 * One step of a drive to a row's state. A target is `label=<name>` or
 * `id=<testID>`, as `@manna/sim` reads it; on the web `label` is the
 * accessible name and `id` the `data-testid`.
 */
export type Step =
  | { readonly open: string; readonly expect: string }
  | { readonly tap: string }
  | { readonly scroll: string; readonly direction: 'up' | 'down' }
  | { readonly fill: string; readonly value: string }
  | { readonly wait: number }
  | { readonly pinch: string; readonly scale: number }
  | { readonly pan: string; readonly dx: number; readonly dy: number; readonly ms?: number }
  | { readonly back: true }
  | { readonly relaunch: true };

/** A rectangle in points left out of the score, and why. */
export interface MaskSpec {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly reason: string;
}

/** How one side reaches a row: its steps, the target held down through the capture, its masks, and the hosts it does not draw. */
export interface Side {
  readonly steps: ReadonlyArray<Step>;
  /** A target pressed and held while the picture is taken (`tap <id> down`). */
  readonly hold?: string;
  readonly masks?: ReadonlyArray<MaskSpec>;
  /** Reduce Motion on for the capture, so a pulse or a fade is still. */
  readonly reduceMotion?: boolean;
  /** The web steps where they differ from the iOS ones. */
  readonly web?: ReadonlyArray<Step>;
  /** Why a host draws no such screen, by host: its cells are not drawable and named so. */
  readonly notDrawn?: Partial<Record<Host, string>>;
  /** Where a banded row's band starts on the One side (iOS), read from the tree at capture. */
  readonly band?: OneBand;
}

/**
 * The top of a Heartseed row's content band in One's picture (spec,
 * "Heartseed's content band"): the lowest bottom edge (`edge: bottom`, under
 * One's header row) or the highest top edge (`edge: top`, a screen with no
 * header row) of the targets named that are on screen, read from the
 * accessibility tree when the reference is taken. The band runs to the
 * picture's foot.
 */
export interface OneBand {
  readonly targets: ReadonlyArray<string>;
  readonly edge: 'top' | 'bottom';
}

export interface Row {
  readonly id: string;
  readonly unit: string;
  readonly kind: 'match' | 'gap' | 'exact-only';
  readonly sweep?: boolean;
  readonly fixture?: string;
  /** The local hour the row is captured at, when its look depends on it. */
  readonly clock?: string;
  /** The One app's side; none for an Exact-only row. */
  readonly one?: Side;
  /** The port's side, written by the row's unit; none until then. */
  readonly exact?: ExactSide;
  /** Where a banded row's two bands are laid edge to edge: their tops (the default), or their feet for a row scrolled to its end. */
  readonly anchor?: 'top' | 'bottom';
  /**
   * The software keyboard is up in this row's iOS state. The system draws
   * it, so it lies outside the score as Heartseed's bars do, not under a
   * mask: each side's band ends at the keyboard's top, read at capture
   * (One's from the tree's keyboard, the port's from the agent's
   * `state keyboard`). A capture with no keyboard up fails.
   */
  readonly keyboard?: true;
}

/**
 * How the port reaches a row: the ops of `bun run exact agent <host>` that
 * follow its launch (`tap gear`, `clock settle`, …), its masks, and whether
 * it starts from the row's fixture written to the port's store. The scheme
 * is set by the harness (`prefer prefers-color-scheme`); the screenshot is
 * the harness's last op.
 */
interface ExactSide {
  readonly ops: ReadonlyArray<string>;
  readonly masks?: ReadonlyArray<MaskSpec>;
  /**
   * A banded row's band in the port's picture: from the bottom edge (or,
   * with `edge: 'top'`, the top edge) of the node `top` names (the top of
   * the content under the navigation bar) to the foot of the scrollport of
   * the scroller `bottom` names (where UIKit's tab bar inset begins), or the
   * top of `bottom` when it is no scroller (a node under a fixed footer),
   * both read from the agent's whole-tree `layout` at capture, in the
   * screen's points (`agent-band.ts`). Every banded row's unit writes it with the row's ops.
   */
  readonly band?: ExactBand;
  /**
   * `platform`: the drive's taps and drags are real touches (Exact's
   * `--touch platform`), for an op UIKit must see as a finger, as a drag that
   * pulls a sheet to its full detent; by default the agent delivers them to
   * the page itself, which no system sheet follows.
   */
  readonly touch?: 'platform';
  /** The web cells' ops and masks (in CSS pixels), where they differ from the iOS ones; iOS masks are never laid on a web picture. */
  readonly web?: { readonly ops?: ReadonlyArray<string>; readonly masks?: ReadonlyArray<MaskSpec> };
}

/** The port's band edges, by node: see `ExactSide.band`. */
export interface ExactBand {
  readonly top: string;
  readonly bottom: string;
  readonly edge?: 'top' | 'bottom';
}

/** One cell of a row's matrix. */
export interface Cell {
  readonly app: AppName;
  readonly host: Host;
  readonly id: string;
  readonly scheme: Scheme;
  /** The text size (iOS) or the viewport (web). */
  readonly size: string;
}

export const cellName = (cell: Cell) =>
  `${cell.app}/${cell.host}/${cell.id}/${cell.scheme}/${cell.size}`;

/** Every cell of `row` in `app`'s matrix; none for an Exact-only row. */
export const cellsOf = (app: AppName, row: Row): ReadonlyArray<Cell> => {
  if (row.kind === 'exact-only') return [];
  const at = (host: Host, scheme: Scheme, size: string): Cell => ({
    app,
    host,
    id: row.id,
    scheme,
    size,
  });
  const cells: Cell[] = [];
  if (HOSTS[app].includes('ios')) {
    cells.push(...IOS.schemes.map((scheme) => at('ios', scheme, IOS.size)));
    if (row.sweep === true)
      cells.push(...IOS.sweepSizes.map((size) => at('ios', IOS.sweepScheme, size)));
  }
  if (HOSTS[app].includes('web'))
    cells.push(
      ...WEB.viewports.flatMap((viewport) =>
        WEB.schemes.map((scheme) => at('web', scheme, viewport)),
      ),
    );
  return cells;
};

/** A viewport's width, height and device pixels a CSS pixel: `390x844@2`. */
export const viewportOf = (viewport: string) => {
  const [size = '', scale = '1'] = viewport.split('@');
  const [width = '0', height = '0'] = size.split('x');
  return { width: Number(width), height: Number(height), scale: Number(scale) };
};
