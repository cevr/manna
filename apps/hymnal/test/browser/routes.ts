/* oxlint-disable effect/noTernary -- the browser test's routes, plain paths. */

export const lists = {
  hymns: { path: '/', title: 'Hymns' },
  search: { path: '/search', title: 'Search' },
} as const;

export type ListName = keyof typeof lists;

export const listOf = (path: string): ListName => (path.startsWith('/search') ? 'search' : 'hymns');
