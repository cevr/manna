const PAGE_OPEN = '<g class="book-page">';
const SPINE_OPEN = '<g class="book-spine">';

export const withLeaf = (book: string) => {
  const from = book.indexOf(PAGE_OPEN);
  const to = book.indexOf('</g>', from);
  const spine = book.indexOf(SPINE_OPEN);
  if (from < 0 || to < 0 || spine < to) return book;
  const leaf = `<g class="leaf">${book.slice(from + PAGE_OPEN.length, to)}</g>`;
  return `${book.slice(0, spine)}${leaf}${book.slice(spine)}`;
};
