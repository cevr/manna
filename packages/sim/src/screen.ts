/**
 * The screen as agent-device's raw snapshot (`snapshot --json --raw`) gives
 * it on iOS, read as numbers and the caller's own names, never as an app's
 * words: the readout `sim read` prints, and the scroll view a `sim scroll`
 * pans inside, with whether its content moved.
 */
import { Effect, Option, Schema } from 'effect';

const Rect = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  width: Schema.Finite,
  height: Schema.Finite,
});
type Rect = typeof Rect.Type;

/** A node of the raw snapshot, with the fields a reader of the screen reads. */
const Node = Schema.Struct({
  index: Schema.optionalKey(Schema.Finite),
  parentIndex: Schema.optionalKey(Schema.Finite),
  ref: Schema.optionalKey(Schema.String),
  type: Schema.optionalKey(Schema.String),
  kind: Schema.optionalKey(Schema.String),
  identifier: Schema.optionalKey(Schema.String),
  label: Schema.optionalKey(Schema.String),
  value: Schema.optionalKey(Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])),
  rect: Schema.optionalKey(Rect),
  enabled: Schema.optionalKey(Schema.Boolean),
  selected: Schema.optionalKey(Schema.Boolean),
  checked: Schema.optionalKey(Schema.Boolean),
  hittable: Schema.optionalKey(Schema.Boolean),
});
export type Node = typeof Node.Type;

const Snapshot = Schema.Struct({
  data: Schema.Struct({ nodes: Schema.Array(Node) }),
});

/** The nodes of agent-device's `snapshot --json --raw` answer. */
export const nodesOf = (json: string) =>
  Effect.map(
    Schema.decodeEffect(Schema.fromJsonString(Snapshot))(json),
    (snapshot) => snapshot.data.nodes,
  );

const tenth = (value: number) => Math.round(value * 10) / 10;

/** The numerals in a text, as numbers; none for a text with none. */
const numerals = (text: string) =>
  [...text.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));

/** Whether a node's centre lies on the screen `screen`. */
const onScreen = (node: Node, screen: Rect) =>
  Option.exists(Option.fromUndefinedOr(node.rect), (rect) => {
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    return (
      x >= screen.x && x < screen.x + screen.width && y >= screen.y && y < screen.y + screen.height
    );
  });

/** The app's own frame: the first application or window node's, else none. */
const screenOf = (nodes: ReadonlyArray<Node>) =>
  Option.fromUndefinedOr(
    nodes.find((node) => node.type === 'Application' || node.type === 'Window')?.rect,
  );

/**
 * What a readout gives of one node: its type, frame (to a tenth of a point),
 * whether its centre is on screen, its states, and the numerals of its
 * value. A fact the tree does not give is left out.
 */
const facts = (node: Node, screen: Option.Option<Rect>) => ({
  type: node.type,
  frame: Option.getOrUndefined(
    Option.map(Option.fromUndefinedOr(node.rect), (rect) =>
      [rect.x, rect.y, rect.width, rect.height].map(tenth),
    ),
  ),
  shown: Option.getOrUndefined(Option.map(screen, (frame) => onScreen(node, frame))),
  hittable: node.hittable,
  enabled: node.enabled,
  selected: node.selected,
  checked: node.checked,
  value: numerals(
    Option.match(Option.fromUndefinedOr(node.value), { onNone: () => '', onSome: String }),
  ),
});

/** What `sim read` is asked for. */
export interface Ask {
  /** TestIDs; one ending in `*` reads every id it begins. */
  readonly ids: ReadonlyArray<string>;
  /** The app's own names (its chrome, a reference), each matched whole. */
  readonly labels: ReadonlyArray<string>;
}

const matchesId = (asked: string, id: string) => {
  if (asked.endsWith('*')) return id.startsWith(asked.slice(0, -1));
  return id === asked;
};

/**
 * The readout of `nodes` for `ask`: the count of nodes and of each type,
 * and for each asked testID and name its nodes, a text's among them, with
 * their facts. A node's own label reaches it only as a name the caller asked, and
 * its value only as the digits in it, so an app's words never do.
 */
export const readout = (nodes: ReadonlyArray<Node>, ask: Ask) => {
  const screen = screenOf(nodes);
  const types: Record<string, number> = {};
  for (const node of nodes) {
    const type = node.type ?? 'none';
    types[type] = (types[type] ?? 0) + 1;
  }
  const ids = Object.fromEntries(
    ask.ids.map((asked) => [
      asked,
      nodes.flatMap((node) =>
        Option.toArray(
          Option.map(
            Option.filter(Option.fromUndefinedOr(node.identifier), (id) => matchesId(asked, id)),
            (id) => ({ id, ...facts(node, screen) }),
          ),
        ),
      ),
    ]),
  );
  const labels = Object.fromEntries(
    ask.labels.map((name) => [
      name,
      nodes.filter((node) => node.label === name).map((node) => facts(node, screen)),
    ]),
  );
  return { nodes: nodes.length, types, ids, labels };
};

type Direction = 'up' | 'down' | 'left' | 'right';

const VERTICAL: ReadonlySet<Direction> = new Set(['up', 'down']);

/** The node types a scroll view shows as in the tree. */
const AREAS: ReadonlySet<string> = new Set(['ScrollView', 'Table', 'CollectionView']);

/** The part of `a` inside `b`, or none when they do not meet. */
const meet = (a: Rect, b: Rect) => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return Option.liftPredicate({ x, y, width, height }, () => width > 0 && height > 0);
};

/** A scroll view on screen: its frame, the part of it on screen, and its content's frame. */
export interface Area {
  readonly frame: Rect;
  readonly visible: Rect;
  readonly content: Rect;
}

/** The scroll views of `nodes` on screen, each with its content (its first child with a frame). */
const areasOf = (nodes: ReadonlyArray<Node>): ReadonlyArray<Area> => {
  const screen = screenOf(nodes);
  if (Option.isNone(screen)) return [];
  const isArea = (node: Node) => AREAS.has(node.type ?? '') || node.kind === 'scroll-area';
  return nodes.filter(isArea).flatMap((node) =>
    Option.toArray(
      Option.gen(function* () {
        const frame = yield* Option.fromUndefinedOr(node.rect);
        const index = yield* Option.fromUndefinedOr(node.index);
        const visible = yield* meet(frame, screen.value);
        const content = yield* Option.firstSomeOf(
          nodes.map((child) =>
            Option.filter(Option.fromUndefinedOr(child.rect), () => child.parentIndex === index),
          ),
        );
        return { frame, visible, content } satisfies Area;
      }),
    ),
  );
};

/** Whether `area`'s content runs past its frame along the axis of `direction`. */
const overflows = (area: Area, direction: Direction) => {
  if (VERTICAL.has(direction)) return area.content.height > area.frame.height + 1;
  return area.content.width > area.frame.width + 1;
};

/** Whether `area`'s content still hides some of itself beyond the frame in `direction`. */
export const hides = (area: Area, direction: Direction) => {
  const { frame, content } = area;
  return {
    down: content.y + content.height > frame.y + frame.height + 1,
    up: content.y < frame.y - 1,
    right: content.x + content.width > frame.x + frame.width + 1,
    left: content.x < frame.x - 1,
  }[direction];
};

/**
 * The scroll view a scroll in `direction` moves: of those on screen whose
 * content runs past the frame along that axis, the one with the most of
 * itself on screen. None when no such view shows.
 */
export const areaFor = (nodes: ReadonlyArray<Node>, direction: Direction) =>
  Option.fromUndefinedOr(
    areasOf(nodes)
      .filter((area) => overflows(area, direction))
      .toSorted((a, b) => b.visible.width * b.visible.height - a.visible.width * a.visible.height)
      .at(0),
  );

/** A one-finger pan: from (`x`, `y`), by `dx` and `dy` points. */
export interface Pan {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
}

/** How much of the visible frame a pan crosses, and where it starts from the far edge. */
const REACH = 0.6;
const START = 0.8;

/**
 * The pan that scrolls `area` one step in `direction`, inside the part of it
 * on screen: a finger from 80% of the way across it toward the content asked
 * for, back across 60% of it, through its middle on the other axis. A pan
 * that starts on a fixed header or footer outside the frame moves nothing.
 */
export const panFor = (area: Area, direction: Direction): Pan => {
  const { x, y, width, height } = area.visible;
  const middle = { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
  const far = (from: number, size: number) => Math.round(from + size * START);
  const near = (from: number, size: number) => Math.round(from + size * (1 - START));
  const reach = (size: number) => Math.round(size * REACH);
  return {
    down: { x: middle.x, y: far(y, height), dx: 0, dy: -reach(height) },
    up: { x: middle.x, y: near(y, height), dx: 0, dy: reach(height) },
    right: { x: far(x, width), y: middle.y, dx: -reach(width), dy: 0 },
    left: { x: near(x, width), y: middle.y, dx: reach(width), dy: 0 },
  }[direction];
};

/**
 * Whether the content of `area` moved between its snapshot and `after`:
 * the scroll view with the same frame shows its content elsewhere along the
 * axis of `direction`, or no longer shows (the screen changed).
 */
export const moved = (area: Area, after: ReadonlyArray<Node>, direction: Direction) => {
  const same = Option.fromUndefinedOr(
    areasOf(after).find(
      (each) =>
        Math.abs(each.frame.x - area.frame.x) < 1 &&
        Math.abs(each.frame.y - area.frame.y) < 1 &&
        Math.abs(each.frame.width - area.frame.width) < 1 &&
        Math.abs(each.frame.height - area.frame.height) < 1,
    ),
  );
  return Option.match(same, {
    onNone: () => true,
    onSome: (now) => {
      if (VERTICAL.has(direction)) return Math.abs(now.content.y - area.content.y) >= 1;
      return Math.abs(now.content.x - area.content.x) >= 1;
    },
  });
};

/**
 * Whether a node that answers the target (`id` or `label`, matched whole, of
 * type `role` when given, matched without case) shows: its centre on the
 * screen, and the tree calls it hittable.
 */
export const shows = (
  nodes: ReadonlyArray<Node>,
  target: {
    readonly by: 'id' | 'label';
    readonly value: string;
    readonly role: Option.Option<string>;
  },
) => {
  const screen = screenOf(nodes);
  const key = ({ id: 'identifier', label: 'label' } as const)[target.by];
  return nodes.some(
    (node) =>
      node[key] === target.value &&
      Option.match(target.role, {
        onNone: () => true,
        onSome: (role) => (node.type ?? '').toLowerCase() === role.toLowerCase(),
      }) &&
      node.hittable !== false &&
      Option.exists(screen, (frame) => onScreen(node, frame)),
  );
};
