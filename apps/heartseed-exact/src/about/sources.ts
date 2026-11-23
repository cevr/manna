import { VERSION_PREFIX } from '@manna/heartseed/about/version';

/** One licence as the licences' page shows it: numbered from 0, its text whole, which names itself in its first lines. */
export interface AboutLicence {
  readonly index: number;
  readonly text: string;
}

/** What About and its licences show: the app's version line, and the licences in the order the page lists them. */
export interface AboutShown {
  readonly version: string;
  readonly licences: AboutLicence[];
}

/** About's line under the app's name, in the current Heartseed's words: its `VERSION_PREFIX`, then the version. */
export const versionLine = (version: string): string => `${VERSION_PREFIX}${version}`;

/** About's data source over the licences' `texts` and the app's `version`, as `app.ts` registers it. */
export const aboutSources = (texts: readonly string[], version: string) => ({
  aboutOf: (): AboutShown => ({
    version: versionLine(version),
    licences: texts.map((text, index) => ({ index, text })),
  }),
});
