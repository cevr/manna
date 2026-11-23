/** Whether the screens before the first verse show for the first run or as the replay from home. */
export type IntroRun = 'first' | 'replay';

/** The welcome's words; see `src/first/words.ts`. */
export declare const WELCOME: {
  readonly heading: 'Heartseed';
  readonly line: 'Plant a verse. Say it from memory. Watch it grow.';
  readonly first: 'Your first verse';
  readonly begin: 'Begin';
  readonly skip: 'Skip';
};

/** How a verse grows: its heading, its line and the reference under it. */
export declare const GROWS: {
  readonly heading: 'Every verse is a plant';
  readonly line: 'Say it from memory and it grows. Each day the app brings back the ones that are ready.';
  readonly caption: 'Mark 4:28';
};

/** The second screen's one button, by run. */
export declare const ONWARD: Readonly<Record<IntroRun, string>>;

/** The phases of the verse itself. */
export type ShownPhase = 'hear' | 'letters' | 'alone' | 'planted';

/** Each phase's heading and the line under it. */
export declare const COPY: Readonly<
  Record<ShownPhase, { readonly heading: string; readonly line: string }>
>;

/** The phases the phase bar counts, in order. */
export declare const PHASES: readonly ShownPhase[];

/** The two ways to replay the welcome. */
export declare const REPLAY: {
  readonly how: 'How Heartseed works';
  readonly again: 'Show the welcome again';
};

/** The pills' labels and Planted's stage line. */
export declare const PILLS: {
  readonly next: 'Next';
  readonly continue: 'Continue';
  readonly gotIt: 'Got it';
  readonly listen: 'Listen';
  readonly stage: 'A seed';
  readonly stageSaid: 'Stage: seed';
};
