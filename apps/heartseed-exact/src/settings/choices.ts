/**
 * The Settings sheet's three choices as the port reads and offers them. Each
 * is kept by Contract's `persist` as plain text (`settingsMinutesKept`,
 * `settingsVoiceKept`, `settingsAppearanceKept`, empty until chosen), and
 * read here by the current Heartseed's rule: the text when it is exactly one
 * of the choices, else the default, 5 minutes, Her and System. The choices
 * offered, in order, are the current app's own lists, imported.
 */

import { APPEARANCES, appearanceOf } from '@manna/heartseed/appearance';
import { MINUTES, type Minutes } from '@manna/heartseed/session';
import { CHOICES, type Choice as Voice } from '@manna/heartseed/voice/reading';

import { feelAnswer, type FeelAnswer } from './feel';

/** One choice as the sheet offers it: the text kept, the words shown. */
export interface SettingsOption {
  readonly value: string;
  readonly label: string;
}

/** The sheet's choices as read, and the options it offers for each, in the current app's order. */
export interface SettingsView {
  readonly minutes: number;
  readonly voice: string;
  readonly appearance: string;
  readonly minutesOptions: SettingsOption[];
  readonly voiceOptions: SettingsOption[];
  readonly appearanceOptions: SettingsOption[];
}

/** The minutes of a kept text that names none of `MINUTES`, as the current session reads a missing or other text. */
const DEFAULT_MINUTES: Minutes = 5;

/** The voice of a kept text that names none of `CHOICES`, as the current voice reads a missing or other text. */
const DEFAULT_VOICE: Voice = 'her';

/** The minutes a kept text names: one of `MINUTES` when the text is exactly its digits, else 5. */
export const minutesOf = (kept: string): Minutes =>
  MINUTES.find((minutes) => String(minutes) === kept) ?? DEFAULT_MINUTES;

/** The voice a kept text names: one of `CHOICES` when the text is exactly it, else Her. */
export const voiceOf = (kept: string): Voice =>
  CHOICES.find((choice) => choice === kept) ?? DEFAULT_VOICE;

/** A word with its first letter raised, as the sheet labels a choice. */
const titled = (word: string) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;

/** The sheet's view of the three kept texts. */
export const settingsView = (minutes: string, voice: string, appearance: string): SettingsView => ({
  minutes: minutesOf(minutes),
  voice: voiceOf(voice),
  appearance: appearanceOf(appearance),
  minutesOptions: MINUTES.map((each) => ({ value: String(each), label: `${each} min` })),
  voiceOptions: CHOICES.map((each) => ({ value: each, label: titled(each) })),
  appearanceOptions: APPEARANCES.map((each) => ({ value: each, label: titled(each) })),
});

/** The settings' data sources, as `app.ts` registers them: the view of the kept texts, and whether Sounds and haptics is on, each answered at once. */
export const settingsSources = {
  settingsOf: ([minutes, voice, appearance]: readonly [string, string, string]): SettingsView =>
    settingsView(minutes, voice, appearance),
  settingsFeelOf: ([kept]: readonly [string]): FeelAnswer => feelAnswer(kept),
};
