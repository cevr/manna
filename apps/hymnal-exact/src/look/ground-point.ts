/** A box as shares of the screen's width and height, 0 to 1. */
export type Box = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

/** The whole screen as a `Box`. */
export const SCREEN: Box = { x: 0, y: 0, w: 1, h: 1 };

/** How far in from a box's trailing edge a ground is read: about 6 pt of a phone's width, inside every screen's and sheet's padding. */
const INSET = 0.015;

/** The screen heights a ground is read at: seven tenths down and a little lower, below a half-height sheet's Done and clear of the web's pointer left there after closing it. A row separator, one point high, can lie under one of them, never both. */
const DOWNS = [0.7, 0.71];

/**
 * A box as shares of a screen `width` by `height`, from a frame in the
 * screen's own units (`node.space.viewport` of the agent's `layout`).
 */
export const boxOf = (
  frame: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  width: number,
  height: number,
): Box => ({ x: frame.x / width, y: frame.y / height, w: frame.w / width, h: frame.h / height });

/**
 * The two points a ground painted in `box` is read at, as shares of the
 * screen: just in from the box's trailing edge, at `DOWNS` held inside the
 * box. On the whole screen they are the screen's trailing edge; in a sheet
 * iOS draws inset from the screen's sides, they are on the sheet, never on
 * the dimmed list beside it.
 */
export const groundPoints = (box: Box) => {
  const inset = Math.min(INSET, box.w / 2, box.h / 2);
  const x = box.x + box.w - inset;
  return DOWNS.map((down) => ({
    x,
    y: Math.min(Math.max(down, box.y + inset), box.y + box.h - inset),
  }));
};
