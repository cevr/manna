/* oxlint-disable effect/noTernary, effect/noNullish -- a drive's edges are each asked for or not, and its replies read by their place in the output: plain TypeScript as the harness's other host tools. */

/**
 * The port's band read from Exact's agent (`bun run exact agent ios --json`,
 * one JSON line per op), from the whole-tree `layout` reply, whose nodes
 * stand in the screen's points. Its top is the bottom edge (or, with
 * `edge: 'top'`, the top edge) of the node `top` names. `layout <node>`
 * is not read: its `absolute` box stands in the content of the scroller
 * that holds the node, so a node inside a scroller (About's lead) answers
 * the same y wherever its sheet sits. Its bottom is where the scroller
 * `bottom` names stops showing content clear of the bars: the foot of its
 * scrollport (`port`, `[x, y, w, h]`). UIKit insets a tab's last scroller
 * by the tab bar's height (Exact's `docs/agent-pitfalls.md`, "A scrolled
 * sheet or screen ends 34 points higher"), and the tab bar is drawn by
 * UIKit, so no node of the tree has its frame: the scrollport's foot is its
 * top. A screen whose scroller sits over a fixed footer (Today) names
 * instead a zero-high node under the footer, and its top is the foot. A row
 * with the keyboard up ends its band at the keyboard's top, from
 * `state keyboard`.
 */

import { Option, Schema } from 'effect';

import type { Band } from './diff.ts';
import type { ExactBand } from './model.ts';

/** What a cell's drive reads before its screenshot: its band's edges, the keyboard's top, either or both. */
interface Edges {
  readonly band?: ExactBand;
  readonly keyboard?: boolean;
}

/** The ops a drive ends with, before its screenshot, for `edges`: the whole-tree `layout` for a band, `state keyboard` for the keyboard. */
export const edgeOps = (edges: Edges) => [
  ...(edges.band === undefined ? [] : ['layout']),
  ...(edges.keyboard === true ? ['state keyboard'] : []),
];

const TreeReply = Schema.Struct({
  nodes: Schema.Array(
    Schema.Struct({
      testId: Schema.optional(Schema.String),
      y: Schema.optional(Schema.Finite),
      h: Schema.optional(Schema.Finite),
      port: Schema.optional(
        Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite, Schema.Finite]),
      ),
    }),
  ),
});

/** The agent's `state keyboard` reply: UIKit's keyboard, its top in the page's points while it is up. */
const KeyboardReply = Schema.Struct({ visible: Schema.Literal(true), top: Schema.Finite });

const treeReply = Schema.decodeUnknownOption(Schema.fromJsonString(TreeReply));
const keyboardReply = Schema.decodeUnknownOption(Schema.fromJsonString(KeyboardReply));

type TreeNode = (typeof TreeReply.Type)['nodes'][number];

const nodeOf = (tree: typeof TreeReply.Type, testId: string) =>
  Option.fromNullishOr(tree.nodes.find((node) => node.testId === testId));

/** The band's top, in points: the top node's top edge, or its foot. */
const topOf = (node: TreeNode, band: ExactBand) =>
  Option.flatMap(Option.fromNullishOr(node.y), (y) =>
    band.edge === 'top' ? Option.some(y) : Option.map(Option.fromNullishOr(node.h), (h) => y + h),
  );

/**
 * The band's foot, in points: the foot of the node's scrollport when it is
 * a scroller, else its top (a zero-high node closing a screen whose last
 * scroller sits over a fixed footer, as Today's does, so its scrollport
 * ends above the footer).
 */
const footOf = (node: TreeNode) =>
  Option.match(Option.fromNullishOr(node.port), {
    onNone: () => Option.fromNullishOr(node.y),
    onSome: ([, y, , h]) => Option.some(y + h),
  });

/** The band's top and bottom in points from the whole-tree reply; none when either edge is not in it. */
const bandIn = (line: string, band: ExactBand) =>
  Option.flatMap(treeReply(line), (tree) =>
    Option.all({
      top: Option.flatMap(nodeOf(tree, band.top), (node) => topOf(node, band)),
      bottom: Option.flatMap(nodeOf(tree, band.bottom), footOf),
    }),
  );

/**
 * The port's band in device pixels at `scale` from the agent's output: the
 * replies of `edgeOps(edges)` are the lines before the last, the
 * screenshot's. A row with the keyboard up and no band runs from the
 * picture's top to the keyboard's; with a band, to the higher of the
 * band's foot and the keyboard's top. None when an edge is not in its
 * reply, or when the keyboard is not up.
 */
export const agentBand = (out: string, edges: Edges, scale: number): Option.Option<Band> => {
  const replies = out.trim().split('\n').slice(0, -1);
  const keyboard = edges.keyboard === true ? (replies.at(-1) ?? '') : undefined;
  const bandReplies = keyboard === undefined ? replies : replies.slice(0, -1);
  const band =
    edges.band === undefined
      ? Option.some({ top: 0, bottom: Number.POSITIVE_INFINITY })
      : bandIn(bandReplies.at(-1) ?? '', edges.band);
  const foot =
    keyboard === undefined
      ? Option.some(Number.POSITIVE_INFINITY)
      : Option.map(keyboardReply(keyboard), (reply) => reply.top);
  return Option.all({ band, foot }).pipe(
    Option.map(({ band: points, foot: at }) => ({
      top: points.top * scale,
      bottom: Math.min(points.bottom, at) * scale,
    })),
  );
};
