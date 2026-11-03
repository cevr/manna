import { Option } from 'effect';

export interface ContextLike {
  readonly isHeading: boolean;
}

export interface ContextSide<A> {
  readonly shown: readonly A[];
  readonly more: number;
}

export const contextSide = <A extends ContextLike>(
  paragraphs: readonly A[],
  expanded: boolean,
  shownWhenCollapsed: number,
): ContextSide<A> => {
  const stop = Option.filter(
    Option.some(paragraphs.findIndex((para) => para.isHeading)),
    (index) => index >= 0,
  );
  const upTo = Option.match(stop, {
    onNone: () => paragraphs.length,
    onSome: (index) => index + 1,
  });
  const available = paragraphs.slice(0, upTo);
  if (expanded) return { shown: available, more: 0 };
  const shown = available.slice(0, shownWhenCollapsed);
  return { shown, more: available.length - shown.length };
};
