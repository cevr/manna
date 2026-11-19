/**
 * The port's band read from Exact's agent (`bun run exact agent ios --json`,
 * one JSON line per op). Its top is the bottom edge of the node
 * `layout <top>` answers (`node.absolute`, in points). Its bottom is where
 * the scroller `bottom` names stops showing content clear of the bars: the
 * foot of its scrollport (`port`, `[x, y, w, h]`), which the whole-tree
 * `layout` reply gives each scroller. UIKit insets a tab's last scroller by
 * the tab bar's height (Exact's `docs/agent-pitfalls.md`, "A scrolled sheet
 * or screen ends 34 points higher"), and the tab bar is drawn by UIKit, so
 * no node of the tree has its frame: the scrollport's foot is its top. A
 * screen whose scroller sits over a fixed footer (Today) names instead a
 * zero-high node under the footer, and its top is the foot.
 */

import { Option, Schema } from 'effect';

import type { Band } from './diff.ts';

/** The two `layout` ops a banded row's drive ends with, before its screenshot. */
export const bandOps = (band: { readonly top: string }) => [`layout ${band.top}`, 'layout'];

const NodeReply = Schema.Struct({
  node: Schema.Struct({ absolute: Schema.Struct({ y: Schema.Finite, h: Schema.Finite }) }),
});

const TreeReply = Schema.Struct({
  nodes: Schema.Array(
    Schema.Struct({
      testId: Schema.optional(Schema.String),
      y: Schema.optional(Schema.Finite),
      port: Schema.optional(
        Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite, Schema.Finite]),
      ),
    }),
  ),
});

const nodeReply = Schema.decodeUnknownOption(Schema.fromJsonString(NodeReply));
const treeReply = Schema.decodeUnknownOption(Schema.fromJsonString(TreeReply));

/**
 * The band's foot, in points, at the node `testId` of a whole-tree `layout`
 * reply: the foot of its scrollport when it is a scroller, else its top (a
 * zero-high node closing a screen whose last scroller sits over a fixed
 * footer, as Today's does, so its scrollport ends above the footer).
 */
const portFoot = (line: string, testId: string) =>
  Option.flatMap(treeReply(line), (tree) =>
    Option.flatMap(
      Option.fromNullishOr(tree.nodes.find((node) => node.testId === testId)),
      (node) =>
        Option.match(Option.fromNullishOr(node.port), {
          onNone: () => Option.fromNullishOr(node.y),
          onSome: ([, y, , h]) => Option.some(y + h),
        }),
    ),
  );

/**
 * The port's band in device pixels at `scale` from the agent's output: the
 * two `layout` replies are the two lines before the last, the
 * screenshot's. None when either edge is not in its reply.
 */
export const agentBand = (
  out: string,
  band: { readonly top: string; readonly bottom: string },
  scale: number,
): Option.Option<Band> => {
  const [top = '', tree = ''] = out.trim().split('\n').slice(-3);
  return Option.all({
    top: Option.map(nodeReply(top), (reply) => reply.node.absolute.y + reply.node.absolute.h),
    bottom: portFoot(tree, band.bottom),
  }).pipe(Option.map((edges) => ({ top: edges.top * scale, bottom: edges.bottom * scale })));
};
