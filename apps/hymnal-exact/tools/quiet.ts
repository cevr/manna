/**
 * The one step every drive takes before it plays a hymn: Sounds and haptics
 * turned off, as the owner's rule asks (the hymnal has no other sound
 * setting). A drive's run opens at `QUIET_PATH`, the Settings sheet, and
 * runs `quietOps`: the switch turned off, read back, the sheet closed on the
 * list. A drive that plays in a later run on the same store first reads
 * `QUIET_CHECK` and stops before Play unless it answers `QUIET_ANSWER`. The browser drive, which plays through Chrome itself, waits
 * for `QUIET_STORED` in the page's `localStorage`. The contract tests open
 * the same way (`QUIET_OPENER`), held there by `src/look/quiet.test.ts`.
 */

export const QUIET_PATH = '/settings';

export const quietOps: ReadonlyArray<string> = [
  'clock data',
  'clock settle',
  'tap settings-feel',
  'clock settle',
  'state settingsFeel',
  'tap settings-done',
  'clock settle',
];

export const QUIET_CHECK = 'state settingsFeel';

/** What `QUIET_CHECK` answers once Sounds and haptics is off. */
export const QUIET_ANSWER = false;

/** The kept answer, as the page's `localStorage` holds it once turned off. */
export const QUIET_STORED = `localStorage.getItem('exact.state.settingsFeelKept') === '"off"'`;

/** The lines each contract test that plays opens with, after its `at "/settings"`. */
export const QUIET_OPENER: ReadonlyArray<string> = [
  'clock settle',
  'tap "settings-feel"',
  'clock settle',
  'expect state settingsFeel == false',
  'tap "settings-done"',
  'clock settle',
];
