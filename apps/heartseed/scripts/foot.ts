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
 * Home's foot as `src/field/screen.tsx` draws it under the lists, written
 * out by hand from the screen: `Add a list` and tip 3 (its words and its
 * badge's `3`), the limit line, and the end rows with their hidden `›`.
 * `src/field/foot.test.tsx` holds it equal to the foot the screen renders;
 * the rule's own models in `journeys.test.ts` draw their targets from it.
 */
export const HOME_FOOT: Foot = {
  ids: new Set(['add-list', 'end-row', 'limit', 'tip-3']),
  labels: new Set([
    '3',
    '3 passages or lists, the most for now. remove one to add another.',
    'add a list',
    'add a psalm, a passage or a set of promises when you want more.',
    'how heartseed works',
    'settings',
    '›',
  ]),
};
