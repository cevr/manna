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
 * the first minute), the limit line, the end rows with their hidden `›`,
 * and the single verses (hsminlist, under the lists: their label, each
 * verse's button, reference, dot and dash, and on a verse planted alone
 * its `Remove`), over the screen test's own single verses (the own verse
 * ready beside Proverbs 4:23 planted alone, or Psalms 119:1-20 bare). `src/field/foot.test.tsx` holds every home state's rendered foot
 * within it and all of them together equal to it; the rule's own models
 * in `journeys.test.ts` draw their targets from it.
 */
export const HOME_FOOT: Foot = {
  ids: new Set([
    'add-list',
    'end-row',
    'limit',
    'tip-2',
    'tip-3',
    'singles',
    'single',
    'field-plant',
    'single-reference',
    'dot',
    'plant-sown',
    'plant-soil',
  ]),
  labels: new Set([
    'single verses',
    'isaiah 41:10, seed, ready today',
    'isaiah 41:10',
    'proverbs 4:23, blade',
    'proverbs 4:23',
    'remove proverbs 4:23',
    'remove',
    ...Array.from({ length: 20 }, (_, at) => [
      `psalms 119:${at + 1}, not planted`,
      `psalms 119:${at + 1}`,
    ]).flat(),
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
