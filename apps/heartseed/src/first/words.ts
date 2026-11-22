/** Whether the screens before the first verse show for the first run or as the replay from home. */
export type IntroRun = 'first' | 'replay';

/** The welcome's words: its heading, its line, the label over the first verse's reference, and its two controls. */
export const WELCOME = {
  heading: 'Heartseed',
  line: 'Plant a verse. Say it from memory. Watch it grow.',
  first: 'Your first verse',
  begin: 'Begin',
  skip: 'Skip',
} as const;

/** How a verse grows: its heading, its line and the reference under it. */
export const GROWS = {
  heading: 'Every verse is a plant',
  line: 'Say it from memory and it grows. Each day the app brings back the ones that are ready.',
  caption: 'Mark 4:28',
} as const;

/** The second screen's one button, by run. */
export const ONWARD: Readonly<Record<IntroRun, string>> = {
  first: 'Plant your first verse',
  replay: 'See your field',
};

/** The phases of the verse itself, the ones the phase bar counts. */
export type ShownPhase = 'hear' | 'letters' | 'alone' | 'planted';

/** Each phase's heading and the line under it. */
export const COPY: Readonly<
  Record<ShownPhase, { readonly heading: string; readonly line: string }>
> = {
  hear: { heading: 'Hear it', line: 'The voice reads it. Words light as they are read.' },
  letters: { heading: 'Say it with help', line: 'First letters stay. Tap the button and say it.' },
  alone: { heading: 'Say it alone', line: 'Only the line is left. Say it from memory.' },
  planted: { heading: 'Planted', line: 'Your first promise is a seed.' },
};

/** The phases the phase bar counts, in order. */
export const PHASES: readonly ShownPhase[] = ['hear', 'letters', 'alone', 'planted'];

/** The two ways to replay the welcome: home's row and the Settings sheet's button. */
export const REPLAY = {
  how: 'How Heartseed works',
  again: 'Show the welcome again',
} as const;

/** The pills' labels and Planted's stage line, shown and spoken. */
export const PILLS = {
  next: 'Next',
  continue: 'Continue',
  gotIt: 'Got it',
  listen: 'Listen',
  stage: 'A seed',
  stageSaid: 'Stage: seed',
} as const;
