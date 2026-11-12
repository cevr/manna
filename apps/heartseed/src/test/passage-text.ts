/* oxlint-disable effect/noNullish -- a DOM reader: an absent node is null, as the DOM gives it. */

/**
 * The plain verse's text as Today shows it under `top` (`app/index.tsx`'s
 * `Verse`): a lined verse's `line-<i>` texts joined by one space (`linesOf`
 * cuts a verse of more than 20 words at its punctuation), else the
 * whole-text node's own text; null while no plain verse shows. A rig
 * compares it with the piece's text, whose whitespace runs are one space.
 */
export const passageTextIn = (top: ParentNode): string | null => {
  const passage = top.querySelector('[data-testid="passage"]');
  if (passage === null) return null;
  const lines = [...passage.querySelectorAll('[data-testid^="line-"]')];
  if (lines.length === 0) return passage.textContent;
  return lines.map((line) => line.textContent ?? '').join(' ');
};
