/** How many hymns the About-this-hymn sheet's `More like this` lists (`About.tsx`; the Exact port reads it too). */
export const MORE_LIKE = 8;

/** The sheet's sections' names, in the order it shows them. */
export const ABOUT_GROUPS = {
  like: 'More like this',
  topics: 'Topics',
  scripture: 'Scripture',
  tune: 'Sing to another tune',
} as const;
