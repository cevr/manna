/** One licence as the licences' page shows it: numbered from 0, named by its own first lines (`licenceName`), and its text whole. */
export interface AboutLicence {
  readonly index: number;
  readonly name: string;
  readonly text: string;
}

/** The licences, in the order the page lists them. */
export interface AboutLicences {
  readonly licences: AboutLicence[];
}

/** A licence's name: its first line that is not blank, then the next up to its first comma, each trimmed; the first alone when no next line holds words. */
export const licenceName = (text: string): string => {
  const [title = '', version = ''] = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const [kept = ''] = version.split(',');
  if (kept === '') return title;
  return `${title}, ${kept}`;
};

/** About's data source over the licences' `texts`, as `app.ts` registers it. */
export const aboutSources = (texts: readonly string[]) => ({
  aboutLicencesOf: (): AboutLicences => ({
    licences: texts.map((text, index) => ({ index, name: licenceName(text), text })),
  }),
});
