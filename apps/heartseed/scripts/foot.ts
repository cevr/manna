/**
 * Home's foot: every test id (as spelled) and every label (folded) of the
 * nodes home's scroll view draws after its furrows, which R7
 * (`footFaults`) reads. The foot a shipped journey is checked against is
 * read from the field screen as it renders (`src/test/foot.ts`, in
 * `src/field/foot.test.tsx`).
 */
export interface Foot {
  readonly ids: ReadonlySet<string>;
  readonly labels: ReadonlySet<string>;
}

/**
 * Home's foot as `src/field/screen.tsx` draws it under the lists over
 * every state, written out by hand from the screen: `Add a list` and tip 3
 * (its words and its badge's `3`), tip 2 (its words and its badge's `2`,
 * under the first furrow, so below the lists when home holds one, as after
 * the first minute), the limit line, and the end rows with their hidden
 * `›`. `src/field/foot.test.tsx` holds every home state's rendered foot
 * within it and all of them together equal to it; the rule's own models
 * in `journeys.test.ts` draw their targets from it.
 */
export const HOME_FOOT: Foot = {
  ids: new Set(['add-list', 'end-row', 'limit', 'tip-2', 'tip-3']),
  labels: new Set([
    '2',
    '3',
    '3 passages or lists, the most for now. remove one to add another.',
    'a list is a set of verses. tap its name to open it.',
    'add a list',
    'add a psalm, a passage or a set of promises when you want more.',
    'how heartseed works',
    'settings',
    '›',
  ]),
};
