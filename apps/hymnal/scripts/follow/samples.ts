import { Array as Arr, Option } from 'effect';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Node {
  readonly index?: number;
  readonly parentIndex?: number;
  readonly identifier?: string;
  readonly label?: string;
  readonly value?: string;
  readonly selected?: boolean;
  readonly rect?: Rect;
}

export const soundOff = (nodes: ReadonlyArray<Node>): boolean =>
  nodes.some(
    (node) =>
      node.label === 'Sound' && (node.value ?? '').split(', ').some((word) => word === 'unchecked'),
  );

export interface Shown {
  readonly selected: boolean;
  readonly rect: Rect;
}

export interface Sample {
  readonly at: number;
  readonly lines: ReadonlyArray<Shown>;
  readonly scroll: Rect | false;
  readonly ended: boolean;
}

export const LONG = 1000;

export const TIMING = 1500;

export interface Timed {
  readonly first: number;
  readonly countIn: number;
  readonly end: number;
  readonly lines: ReadonlyArray<{ readonly start: number; readonly until: number }>;
}

export const SLACK = 1;

const NO_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };

const meet = (a: Rect, b: Rect): Option.Option<Rect> => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return Option.liftPredicate({ x, y, width, height }, () => width > 0 && height > 0);
};

const lineage = (byIndex: ReadonlyMap<number, Node>, node: Node, depth = 100): Array<Node> => {
  const chain = [node];
  for (let at = node; chain.length < depth;) {
    const parent = Option.fromNullishOr(byIndex.get(at.parentIndex ?? -1));
    if (Option.isNone(parent)) break;
    at = parent.value;
    chain.push(at);
  }
  return chain;
};

const shownFrame = (byIndex: ReadonlyMap<number, Node>, node: Node): Option.Option<Rect> =>
  lineage(byIndex, node).reduce(
    (frame, at) => Option.flatMap(frame, (rect) => meet(rect, at.rect ?? rect)),
    Option.fromNullishOr(node.rect),
  );

export const sampleOf = (nodes: ReadonlyArray<Node>, hymn: number, at: number): Sample => {
  const byIndex = new Map(
    nodes.flatMap((node) =>
      Option.match(Option.fromNullishOr(node.index), {
        onNone: () => [],
        onSome: (index) => [[index, node] as const],
      }),
    ),
  );
  const page = Arr.findFirst(nodes, (node) =>
    Option.liftPredicate(node, (at) => at.identifier === 'hymn-scroll').pipe(
      Option.flatMap((scroll) => shownFrame(byIndex, scroll)),
      Option.map((frame) => ({ node, frame })),
    ),
  );
  const onPage = (node: Node) =>
    Option.exists(page, ({ node: scroll }) => lineage(byIndex, node).includes(scroll));
  return {
    at,
    lines: nodes
      .filter((node) => node.identifier === 'line' && onPage(node))
      .map((node) => ({ selected: node.selected === true, rect: node.rect ?? NO_RECT })),
    scroll: Option.match(page, { onNone: () => false, onSome: ({ frame }) => frame }),
    ended: nodes.some((node) => node.label === `Play hymn ${hymn} again`),
  };
};

const within = (y: number, scroll: Rect) =>
  y >= scroll.y - SLACK && y <= scroll.y + scroll.height + SLACK;

const inside = (rect: Rect, scroll: Rect) =>
  within(rect.y, scroll) && within(rect.y + rect.height, scroll);

export interface Verdict {
  readonly hymn: number;
  readonly samples: number;
  readonly lines: number;
  readonly seen: number;
  readonly missed: ReadonlyArray<number>;
  readonly backwards: number;
  readonly last: boolean;
  readonly skipped: number;
  readonly outside: number;
  readonly doubled: number;
  readonly mismatched: number;
  readonly adrift: number;
  readonly early: boolean;
  readonly ended: boolean;
  readonly touches: number;
  readonly holds: boolean;
}

const placeOf = (timed: Timed, at: number) => timed.first + Math.max(0, at - timed.countIn);

const onTime = (span: Timed['lines'][number], place: number) =>
  span.start - TIMING <= place && place < span.until + TIMING;

export const judge = (
  hymn: number,
  timed: Timed,
  samples: ReadonlyArray<Sample>,
  touches: number,
): Verdict => {
  const lengths = timed.lines.map((span) => span.until - span.start);
  let adrift = 0;
  const seen = new Set<number>();
  let before = -1;
  let backwards = 0;
  let skipped = 0;
  let outside = 0;
  let doubled = 0;
  let mismatched = 0;
  for (const sample of samples) {
    if (sample.lines.length !== lengths.length) {
      mismatched++;
      continue;
    }
    const selected = Arr.getSomes(
      sample.lines.map((line, index) => Option.liftPredicate(index, () => line.selected)),
    );
    if (selected.length > 1) doubled++;
    const first = Arr.head(selected);
    if (Option.isNone(first)) continue;
    const line = first.value;
    seen.add(line);
    if (Arr.get(lengths, line).pipe(Option.exists((length) => length <= 0))) skipped++;
    if (
      !Option.exists(Arr.get(timed.lines, line), (span) => onTime(span, placeOf(timed, sample.at)))
    )
      adrift++;
    if (line < before) backwards++;
    before = line;
    const shown = Option.map(Arr.get(sample.lines, line), (at) => at.rect);
    const next = Option.map(Arr.get(sample.lines, line + 1), (at) => at.rect);
    const { scroll } = sample;
    const held =
      scroll !== false &&
      Option.exists(shown, (rect) => inside(rect, scroll)) &&
      Option.match(next, { onNone: () => true, onSome: (rect) => within(rect.y, scroll) });
    if (!held) outside++;
  }
  const missed = Arr.getSomes(
    lengths.map((length, index) =>
      Option.liftPredicate(index, () => length > LONG && !seen.has(index)),
    ),
  );
  const last = Option.exists(
    Arr.findLastIndex(lengths, (length) => length > 0),
    (index) => seen.has(index),
  );
  const ended = samples.some((sample) => sample.ended);
  const early = samples.some(
    (sample) => sample.ended && placeOf(timed, sample.at) < timed.end - TIMING,
  );
  const counts = {
    hymn,
    samples: samples.length,
    lines: lengths.length,
    seen: seen.size,
    missed,
    backwards,
    last,
    skipped,
    outside,
    doubled,
    mismatched,
    adrift,
    early,
    ended,
    touches,
  };
  return { ...counts, holds: holdsOf(counts) };
};

const holdsOf = (counts: Omit<Verdict, 'holds'>): boolean =>
  counts.samples > 0 &&
  counts.missed.length === 0 &&
  counts.backwards === 0 &&
  counts.last &&
  counts.skipped === 0 &&
  counts.outside === 0 &&
  counts.doubled === 0 &&
  counts.mismatched === 0 &&
  counts.adrift === 0 &&
  !counts.early &&
  counts.ended &&
  counts.touches === 1;
