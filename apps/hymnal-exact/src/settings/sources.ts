/**
 * The Appearance rows under the kept text (`lookRows`), each saying whether
 * a hairline divides it from the row above, as the current hymnal's
 * `Choices` draws every row but the first (`k > 0 && styles.divided`).
 */
const appearanceRows = (kept: string) =>
  lookRows(kept).map((row, k) => ({ ...row, divided: k > 0 }));

/**
 * Settings' sources, as `app.ts` registers them: `settingsLooks(kept)`
 * answers the Appearance rows under the kept choice (`appearanceRows`),
 * `settingsChords(style, placement)` the Chord style and Chord placement
 * rows under the kept texts (`chordChoices`), `settingsFeelOf(kept)`
 * whether Sounds and haptics is on (`feelAnswer`), and `aboutCredits()`
 * About's page.
 */

import { lookRows } from '../look/look.ts';
import { aboutPage } from './about.ts';
import { chordChoices } from './chords.ts';
import { feelAnswer } from './feel.ts';

export const settingsSources = () => ({
  settingsLooks: ([kept]: readonly [string]) => appearanceRows(kept),
  settingsChords: ([style, placement]: readonly [string, string]) => chordChoices(style, placement),
  settingsFeelOf: ([kept]: readonly [string]) => feelAnswer(kept),
  aboutCredits: () => aboutPage(),
});
