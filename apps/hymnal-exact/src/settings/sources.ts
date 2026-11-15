/**
 * Settings' sources, as `app.ts` registers them: `settingsLooks(kept)`
 * answers the Appearance rows under the kept choice (`lookRows`), and
 * `aboutCredits()` About's page.
 */

import { lookRows } from '../look/look.ts';
import { aboutPage } from './about.ts';

export const settingsSources = () => ({
  settingsLooks: ([kept]: readonly [string]) => lookRows(kept),
  aboutCredits: () => aboutPage(),
});
