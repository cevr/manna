/**
 * The series marks as drawings laid in the page, so their parts can move
 * when a row is pointed at or focused (`.emblem` in `../styles.css`): the
 * path's sun rises and its rays reach out, the land's plant sways, the
 * healing leaf leans on its stem, and the book turns a leaf. The book gains
 * the leaf here: a copy of its right page (`.book-page`: the page's edges
 * and its lines), laid under the spine (`.book-spine`), so at rest the
 * drawing is the same and a turn carries the leaf across to the left.
 */

const PAGE_OPEN = '<g class="book-page">';
const SPINE_OPEN = '<g class="book-spine">';

/** The book's drawing with its leaf laid under the spine, or the drawing as it is if it has no right page and spine where the leaf expects them. */
export const withLeaf = (book: string) => {
  const from = book.indexOf(PAGE_OPEN);
  const to = book.indexOf('</g>', from);
  const spine = book.indexOf(SPINE_OPEN);
  if (from < 0 || to < 0 || spine < to) return book;
  const leaf = `<g class="leaf">${book.slice(from + PAGE_OPEN.length, to)}</g>`;
  return `${book.slice(0, spine)}${leaf}${book.slice(spine)}`;
};
