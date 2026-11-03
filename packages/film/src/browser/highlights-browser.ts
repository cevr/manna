import { Effect, Layer, Option } from 'effect';
import { Highlights } from './highlights.ts';

const registry = (): Option.Option<HighlightRegistry> =>
  Option.flatMap(
    Option.liftPredicate(globalThis, (g) => 'CSS' in g),
    (g) => Option.fromNullishOr(g.CSS.highlights),
  );

interface Piece {
  readonly node: Text;
  readonly from: number;
}

const piecesOf = (root: Node): ReadonlyArray<Piece> => {
  if (root instanceof Text) return [{ node: root, from: 0 }];
  if (!(root instanceof Element)) return [];
  return [...root.querySelectorAll('[data-from]')].flatMap((el) => {
    const node = el.firstChild;
    if (!(node instanceof Text)) return [];
    return [{ node, from: Number(el.getAttribute('data-from')) }];
  });
};

const blankTo = (range: Range, node: Text): boolean => {
  const end = range.endContainer;
  if (!(end instanceof Text) || range.endOffset !== end.length) return false;
  const between = new Range();
  between.setStart(end, range.endOffset);
  between.setEnd(node, 0);
  return between.toString().trim() === '';
};

const rangesIn = (
  pieces: ReadonlyArray<Piece>,
  ranges: ReadonlyArray<readonly [number, number]>,
): ReadonlyArray<Range> =>
  ranges.flatMap(([start, end]) => {
    const runs: Array<Range> = [];
    for (const { node, from } of pieces) {
      const a = Math.max(start, from);
      const b = Math.min(end, from + node.length);
      if (a >= b) continue;
      const goesOn = Option.filter(
        Option.fromUndefinedOr(runs.at(-1)),
        (last) => a === from && blankTo(last, node),
      );
      if (Option.isSome(goesOn)) {
        goesOn.value.setEnd(node, b - from);
        continue;
      }
      const range = new Range();
      range.setStart(node, a - from);
      range.setEnd(node, b - from);
      runs.push(range);
    }
    return runs;
  });

export const highlightsLayer: Layer.Layer<Highlights> = Layer.succeed(
  Highlights,
  Highlights.of({
    paint: (name, root, ranges) =>
      Effect.sync(() => {
        Option.map(registry(), (highlights) => {
          highlights.set(name, new Highlight(...rangesIn(piecesOf(root), ranges)));
        });
      }),
    clear: (name) =>
      Effect.sync(() => {
        Option.map(registry(), (highlights) => highlights.delete(name));
      }),
  }),
);
