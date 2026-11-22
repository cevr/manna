/** The meaning table's fields, one shipped file each (`meaning-files.ts` writes them, `table.ts` reads them), the largest first. */
export const MEANING_FIELDS = [
  'table',
  'vectors',
  'words',
  'weights',
  'lengths',
  'hymns',
  'dims',
] as const;

/** Where the iOS app ships them: `app.json` puts the folder `meaning/` at `Resources/meaning`. */
export const MEANING_ROOT = 'bundle:/Resources/meaning';
