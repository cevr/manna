// What decides when puppets drawn one after another share one copy onto the
// frame (`canvas/puppet-gl.ts`). Each puppet is drawn in its own passes onto
// the page's puppet canvas, laid over what the puppets before it in the batch
// left there; the batch is copied onto the frame with one `drawImage` of the
// union of their boxes, under the frame context's filter, alpha, compositing
// and shadow as they stood when the batch's puppets were drawn, so a plane's
// blur and haze run once over the batch, not once a puppet.
//
// A batch is open only inside `batched(ctx, draw)` (`f.batch`), and closes,
// copied, when `draw` returns or throws. Inside it a puppet draw joins the
// pending copy when it is drawn on the same context under the same copy
// state; else the pending copy is made first, under its own state, and the
// draw starts a new one. Outside a batch every puppet is copied at once.
// The clip is not part of the state (a context cannot be asked for it), so
// a batch's `draw` leaves the clip as it found it, and draws only puppets:
// anything else it drew would land under the batch's puppets drawn before it.

/** A box on the canvas, px: `[x0, y0, x1, y1)`. */
export type Box = readonly [number, number, number, number];

/** The frame context's state a copy is drawn under, and the context itself. */
export interface CopyKey {
  readonly ctx: CanvasRenderingContext2D;
  readonly filter: string;
  readonly alpha: number;
  readonly composite: GlobalCompositeOperation;
  readonly shadow: readonly [string, number, number, number];
}

/** What a copy is drawn under: `ctx` as it stands now. */
export const copyKeyOf = (ctx: CanvasRenderingContext2D): CopyKey => ({
  ctx,
  filter: ctx.filter,
  alpha: ctx.globalAlpha,
  composite: ctx.globalCompositeOperation,
  shadow: [ctx.shadowColor, ctx.shadowBlur, ctx.shadowOffsetX, ctx.shadowOffsetY],
});

/** Whether two copies are drawn alike: one context, one filter, alpha, compositing and shadow. */
export const sameCopy = (a: CopyKey, b: CopyKey): boolean =>
  a.ctx === b.ctx &&
  a.filter === b.filter &&
  a.alpha === b.alpha &&
  a.composite === b.composite &&
  a.shadow.every((v, i) => v === b.shadow[i]);

/** `ctx` set to draw as `key` says: the copy's own state, whatever the scene set since. */
export const applyCopyKey = (ctx: CanvasRenderingContext2D, key: CopyKey): void => {
  ctx.filter = key.filter;
  ctx.globalAlpha = key.alpha;
  ctx.globalCompositeOperation = key.composite;
  [ctx.shadowColor, ctx.shadowBlur, ctx.shadowOffsetX, ctx.shadowOffsetY] = key.shadow;
};

/** A copy not yet made: what it is drawn under, and the union of its puppets' boxes. */
export interface PendingCopy {
  readonly key: CopyKey;
  readonly box: Box;
}

/** The smallest box holding both. */
export const unionBox = (a: Box, b: Box): Box => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[2], b[2]),
  Math.max(a[3], b[3]),
];

/** What a puppet draw does to the pending copy: the copy to make before it, if any, and the copy pending after it. */
export interface Joined {
  readonly flush: PendingCopy | undefined;
  readonly pending: PendingCopy;
}

/**
 * A puppet drawn under `key` in `box`, with `pending` waiting: the copy to
 * make before it is drawn (`pending`, when drawn otherwise), and the copy
 * pending after it (`pending` grown by `box`, or a new one).
 */
export const joinCopy = (pending: PendingCopy | undefined, key: CopyKey, box: Box): Joined => {
  if (pending === undefined) return { flush: undefined, pending: { key, box } };
  if (!sameCopy(pending.key, key)) return { flush: pending, pending: { key, box } };
  return { flush: undefined, pending: { key: pending.key, box: unionBox(pending.box, box) } };
};

/** The contexts a batch is open on, each with how many `batched` calls hold it open. */
const open = new Map<CanvasRenderingContext2D, number>();

/** Whether a batch is open on `ctx`: its puppets wait for one copy. */
export const isBatched = (ctx: CanvasRenderingContext2D): boolean => open.has(ctx);

/**
 * Run `draw` with a batch open on `ctx`, then `close` it (make its copy),
 * even when `draw` throws: a copy left pending would be drawn into a later
 * frame. A batch opened inside another on the same context closes with it
 * too; the outer one's later puppets start a copy of their own.
 */
export const batched = (ctx: CanvasRenderingContext2D, draw: () => void, close: () => void) => {
  open.set(ctx, (open.get(ctx) ?? 0) + 1);
  try {
    draw();
  } finally {
    const left = (open.get(ctx) ?? 1) - 1;
    if (left === 0) open.delete(ctx);
    else open.set(ctx, left);
    close();
  }
};
