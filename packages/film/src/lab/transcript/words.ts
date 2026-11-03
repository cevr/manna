import { Effect, Option, Record as Rec } from 'effect';
import { createEffect, onCleanup } from 'solid-js';
import { Highlights, type HighlightName } from '../../browser/highlights.ts';
import type { Host } from '../../browser/host.ts';
import type { CodeRange } from '../../core/schema.ts';
import { type Row, type SectionRows, type WordAt, rowOf } from './lit.ts';

const wordOfNode = (node: Option.Option<Node>): Option.Option<WordAt> =>
  Option.flatMap(
    Option.flatMap(
      Option.flatMap(node, (n) =>
        Option.orElse(
          Option.liftPredicate(n, (x): x is Element => x instanceof Element),
          () => Option.fromNullishOr(n.parentElement),
        ),
      ),
      (el) => Option.fromNullishOr(el.closest('[data-index]')),
    ),
    (el) =>
      Option.map(
        Option.fromNullishOr(el.closest('[data-scene]')?.getAttribute('data-scene')),
        (section) => ({ section, index: Number(el.getAttribute('data-index')) }),
      ),
  );

interface WordsPressed {
  readonly sections: () => ReadonlyArray<SectionRows>;
  readonly selectRange: (section: string, from: number, to: number) => void;
  readonly tap: (section: string, row: Row, extend: boolean) => void;
}

export const wordsReleased =
  (verbs: WordsPressed) =>
  (event: MouseEvent): void => {
    const selection = Option.filter(
      Option.fromNullishOr(window.getSelection()),
      (s) => !s.isCollapsed,
    );
    if (Option.isSome(selection)) {
      Option.map(
        Option.filter(
          Option.zipWith(
            wordOfNode(Option.fromNullishOr(selection.value.anchorNode)),
            wordOfNode(Option.fromNullishOr(selection.value.focusNode)),
            (a, b) => ({ a, b }),
          ),
          ({ a, b }) => a.section === b.section,
        ),
        ({ a, b }) =>
          verbs.selectRange(a.section, Math.min(a.index, b.index), Math.max(a.index, b.index)),
      );
      return;
    }
    const target = Option.filter(
      Option.fromNullishOr(event.target),
      (t): t is Node => t instanceof Node,
    );
    Option.map(wordOfNode(target), (at) =>
      Option.map(rowOf(verbs.sections(), at), (row) => verbs.tap(at.section, row, event.shiftKey)),
    );
  };

type Painted<N extends HighlightName = HighlightName> = Readonly<
  Record<N, ReadonlyArray<CodeRange>>
>;

export const usePainted = <N extends HighlightName>(
  host: Host,
  page: () => Option.Option<HTMLElement>,
  painted: () => Painted<N>,
): void => {
  const names = new Set<N>();
  createEffect(painted, (now) => {
    Option.map(page(), (root) =>
      Effect.runSyncWith(host)(
        Highlights.use((h) =>
          Effect.forEach(
            Rec.toEntries(now),
            ([name, ranges]) => {
              names.add(name);
              return h.paint(name, root, ranges);
            },
            { discard: true },
          ),
        ),
      ),
    );
  });
  onCleanup(() =>
    Effect.runSyncWith(host)(
      Highlights.use((h) => Effect.forEach(names, (name) => h.clear(name), { discard: true })),
    ),
  );
};
