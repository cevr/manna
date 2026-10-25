/**
 * The series marks as drawings laid in the page, so their parts can move
 * when a row is pointed at or focused (`.emblem` in `../styles.css`): the
 * path's sun rises and its rays reach out, the land's plant sways, the
 * healing leaf leans on its stem, and the book turns a leaf. The book gains
 * the leaf here: a copy of its right page and that page's lines, drawn in
 * the same fine line and laid under the spine, so at rest the drawing is the
 * same and a turn carries the leaf across to the left.
 */

/** The spine in the book's drawing, which the leaf goes under. */
const SPINE = '<path d="M24 15v25"/>';

const PAGE = 'M24 15c5-3 12-3.5 18-1.5v25c-6-2-13-1.5-18 1.5z';
const LINES = 'M28 20.5c3-1.3 7-1.3 10-.5M28 25.5c3-1.3 7-1.3 10-.5';

/** The leaf: the right page and its lines, unfilled like every line of the mark. */
const LEAF = `<g class="leaf"><path d="${PAGE}"/><path d="${LINES}"/></g>`;

/** The book's drawing with its leaf laid under the spine, or the drawing as it is if it has no spine where the leaf expects one. */
export const withLeaf = (book: string) => {
  const at = book.indexOf(SPINE);
  if (at < 0) return book;
  return `${book.slice(0, at)}${LEAF}${book.slice(at)}`;
};
