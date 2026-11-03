/* oxlint-disable effect/noTernary -- the browser test's routes, plain paths. */

/** The two lists: where each is, and its title. */
export const lists = {
  hymns: { path: '/', title: 'Hymns' },
  search: { path: '/search', title: 'Search' },
} as const;

export type ListName = keyof typeof lists;

/** The list a path belongs to: its own path, or a hymn opened from it. */
export const listOf = (path: string): ListName => (path.startsWith('/search') ? 'search' : 'hymns');
