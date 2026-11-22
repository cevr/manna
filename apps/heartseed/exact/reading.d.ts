/** The voice's settings, Off first, in the order the Settings sheet offers them; see `src/voice/reading.ts`. */
export declare const CHOICES: readonly ['off', 'her', 'him'];
/** One of the voice's settings. */
export type Choice = (typeof CHOICES)[number];
/** How the voice's last reading ended. */
export type Ending = 'finished' | 'stopped' | 'off' | 'interrupted' | 'failed';
