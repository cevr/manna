/**
 * The numbers a verifier reads off the hymnal's accessibility tree, and
 * never its words: from agent-device's raw snapshot (`snapshot --json
 * --raw`), the frames, states and numerals of the nodes asked for by testID
 * or by a name the caller gives (the app's chrome: `Pause hymn 100`,
 * `Open player`), the switches the silent rule reads, the hymn page shown and
 * the bar's Play or Pause. A node's own label or value reaches the readout
 * only as the digits in it, so a hymn's words never do.
 */
import { Clock, Duration, Effect, Option, Schema } from 'effect';

const Rect = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  width: Schema.Finite,
  height: Schema.Finite,
});

/** A node of the raw snapshot, with the fields a readout reads. */
const Node = Schema.Struct({
  ref: Schema.optionalKey(Schema.String),
  type: Schema.optionalKey(Schema.String),
  identifier: Schema.optionalKey(Schema.String),
  label: Schema.optionalKey(Schema.String),
  value: Schema.optionalKey(Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])),
  rect: Schema.optionalKey(Rect),
  enabled: Schema.optionalKey(Schema.Boolean),
  selected: Schema.optionalKey(Schema.Boolean),
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

/** The screen's width in points: the verify-hymnal simulator's iPhone. */
export const SCREEN_WIDTH = 402;

/** The names whose switches or values the silent rule reads before a Play. */
const SILENT = ['Sound', 'Sounds and haptics', 'Chords'] as const;

/** The bar's play button: `Play hymn <n>`, `Pause hymn <n>` or `Play hymn <n> again`. */
const PLAY = /^(Play|Pause) hymn (\d+)( again)?$/;

const tenth = (value: number) => Math.round(value * 10) / 10;

const rectOf = (node: Node) => Option.fromUndefinedOr(node.rect);
const textOf = (node: Node, key: 'label' | 'value' | 'identifier' | 'type') =>
  Option.map(Option.fromUndefinedOr(node[key]), String);

/** Whether a node lies on the screen across: the pager keeps its neighbour pages beside it. */
const shown = (node: Node, width: number) =>
  Option.exists(rectOf(node), (rect) => rect.x >= 0 && rect.x < width);

/** The numerals in a text, as numbers; none for a text with none. */
const numerals = (text: Option.Option<string>) =>
  [...Option.getOrElse(text, () => '').matchAll(/-?\d+(?:\.\d+)?/g)].map((match) =>
    Number(match[0]),
  );

/**
 * What a readout gives of one node: its type, frame and states, and the
 * numerals of its value. A fact the tree does not give is left out of the
 * printed line.
 */
const facts = (node: Node) => ({
  type: Option.getOrUndefined(textOf(node, 'type')),
  frame: Option.getOrUndefined(
    Option.map(rectOf(node), (rect) => [rect.x, rect.y, rect.width, rect.height].map(tenth)),
  ),
  enabled: node.enabled,
  selected: node.selected,
  value: numerals(textOf(node, 'value')),
});

export interface Ask {
  /** TestIDs, each read on the screen; one ending in `*` reads every id it begins. */
  readonly ids: ReadonlyArray<string>;
  /** Names of the app's chrome to read whole; never a hymn's words. */
  readonly labels: ReadonlyArray<string>;
  readonly width: number;
}

const matchesId = (asked: string, id: string) => {
  if (asked.endsWith('*')) return id.startsWith(asked.slice(0, -1));
  return id === asked;
};

const isText = (node: Node) => Option.contains(textOf(node, 'type'), 'StaticText');

/** A switch's value as the tree gives it (`1`/`0` from a Switch, `checked`/`unchecked` from a row), or `absent`. */
const switchValue = (nodes: ReadonlyArray<Node>, name: string) =>
  Option.getOrElse(
    Option.flatMap(
      Option.fromUndefinedOr(
        nodes.find(
          (node) =>
            Option.contains(textOf(node, 'label'), name) && Option.isSome(textOf(node, 'value')),
        ),
      ),
      (node) => textOf(node, 'value'),
    ),
    () => 'absent',
  );

/** The bar's play button a node is, if it is one: its state and hymn. */
const playOf = (node: Node) =>
  Option.flatMap(
    Option.filter(textOf(node, 'label'), () => !isText(node)),
    (label) =>
      Option.map(Option.fromNullishOr(PLAY.exec(label)), (match) => {
        let state = 'idle';
        if (match[1] === 'Pause') state = 'playing';
        else if (match[3] === ' again') state = 'ended';
        return { state, hymn: Number(match[2]) };
      }),
  );

/**
 * The readout of `nodes` for `ask`: the shown nodes of each asked testID, the
 * asked names' nodes, the silent switches, the shown page's hymn number and
 * the bar's play button. Numbers, booleans and the caller's own names only.
 */
export const readout = (nodes: ReadonlyArray<Node>, ask: Ask) => {
  const onScreen = nodes.filter((node) => shown(node, ask.width));
  const ids = Object.fromEntries(
    ask.ids.map((asked) => [
      asked,
      onScreen.flatMap((node) =>
        Option.toArray(
          Option.map(
            Option.filter(textOf(node, 'identifier'), (id) => matchesId(asked, id)),
            (id) => ({ id, ...facts(node) }),
          ),
        ),
      ),
    ]),
  );
  const labels = Object.fromEntries(
    ask.labels.map((name) => [
      name,
      nodes
        .filter((node) => Option.contains(textOf(node, 'label'), name) && !isText(node))
        .map(facts),
    ]),
  );
  const silent = Object.fromEntries(SILENT.map((name) => [name, switchValue(nodes, name)]));
  const page = onScreen
    .filter((node) => Option.contains(textOf(node, 'identifier'), 'hymn-number'))
    .flatMap((node) =>
      numerals(Option.orElse(textOf(node, 'label'), () => textOf(node, 'value'))).slice(0, 1),
    );
  const play = nodes.flatMap((node) => Option.toArray(playOf(node)));
  const position = numerals(
    Option.flatMap(
      Option.fromUndefinedOr(
        nodes.find((node) => Option.contains(textOf(node, 'label'), 'Position')),
      ),
      (node) => textOf(node, 'value'),
    ),
  );
  return { nodes: nodes.length, ids, labels, silent, page, play, position };
};

/**
 * The node a press of `target` lands on: of the shown nodes with that testID
 * (`id=`) or name (`label=`) and a ref, never a static text, a Switch first,
 * then a Button, then the first. None when no shown node answers.
 */
export const pressTarget = (nodes: ReadonlyArray<Node>, target: string, width: number) => {
  let key: 'identifier' | 'label' = 'label';
  if (target.startsWith('id=')) key = 'identifier';
  const name = target.replace(/^(id|label)=/, '');
  const matches = nodes.filter(
    (node) =>
      shown(node, width) &&
      !isText(node) &&
      Option.isSome(Option.fromUndefinedOr(node.ref)) &&
      Option.contains(textOf(node, key), name),
  );
  const ofType = (type: string) =>
    Option.fromUndefinedOr(matches.find((node) => Option.contains(textOf(node, 'type'), type)));
  return ofType('Switch').pipe(
    Option.orElse(() => ofType('Button')),
    Option.orElse(() => Option.fromUndefinedOr(matches[0])),
  );
};

/** The host stayed busier than the limit for the whole wait. */
export class HostBusy extends Schema.TaggedError<HostBusy>()('HostBusy', {
  load: Schema.Finite,
  limit: Schema.Finite,
}) {}

/**
 * Wait until the host's 1-minute load (`readLoad`) is at most `limit`,
 * reading it every `every`; past `within`, fail as `HostBusy` with the last
 * load read. A press paced by it lands on a host calm enough that the app's
 * answer is the app's, not the host's.
 */
export const calm = (
  readLoad: Effect.Effect<number>,
  limit: number,
  every: Duration.Input,
  within: Duration.Input,
) =>
  Effect.gen(function* () {
    let load = yield* readLoad;
    const until = (yield* Clock.currentTimeMillis) + Duration.toMillis(within);
    while (load > limit) {
      if ((yield* Clock.currentTimeMillis) >= until) return yield* HostBusy.make({ load, limit });
      yield* Effect.sleep(every);
      load = yield* readLoad;
    }
    return load;
  });
