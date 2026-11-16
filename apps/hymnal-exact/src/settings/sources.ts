/**
 * Settings' sources, as `app.ts` registers them: `settingsLooks(kept)`
 * answers the Appearance rows under the kept choice (`lookRows`),
 * `settingsFeelOf(kept)` whether Sounds and haptics is on (`feelAnswer`),
 * and `aboutCredits()` About's page.
 */

import { lookRows } from '../look/look.ts';
import { aboutPage } from './about.ts';
import { feelAnswer } from './feel.ts';

export const settingsSources = () => ({
  settingsLooks: ([kept]: readonly [string]) => lookRows(kept),
  settingsFeelOf: ([kept]: readonly [string]) => feelAnswer(kept),
  aboutCredits: () => aboutPage(),
});
