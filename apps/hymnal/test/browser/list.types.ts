import type { Seen } from './list.slow.test';

export const aPressAtOnceIsLabelled = (v: Seen) => {
  if (v.press === 'now') {
    const label: boolean = v.leftBeforeScrollEvent;
    const tries: number = v.tries;
    return { label, tries };
  }
  // @ts-expect-error: a later press has no label.
  void v.leftBeforeScrollEvent;
  // @ts-expect-error: a later press has no try.
  return v.tries;
};
