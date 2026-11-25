/** One cue's body, as the view reads it. */
export interface FeelRow {
  readonly cue: string;
  readonly haptic: string;
  readonly floor: number;
  readonly sounds: ReadonlyArray<string>;
  readonly lengths: ReadonlyArray<number>;
  readonly gain: number;
  readonly group: string;
}

/** The folder under the app the sounds are written to and declared from. */
export const SOUND_FOLDER = 'assets/feel';

/** The file the voice's sound `name` is written to. */
export const soundPath = (name: string): string => `${SOUND_FOLDER}/${name}.wav`;

/** The least time between two ticks' haptics, in ms (the current app's `FLOOR`). */
const FLOOR = 30;

/** How long a thock plays, and a key's tine, in ms: their files' whole length. */
const THOCK_MS = 42;
const TINE_MS = 112;

/** The key dial's twelve tines, C up to B. */
const KEYS = Array.from({ length: 12 }, (_, n) => `key-${n}`);

const felt = (cue: string, haptic: string, floor = 0): FeelRow => ({
  cue,
  haptic,
  floor,
  sounds: [],
  lengths: [],
  gain: 1,
  group: 'feel',
});

const heard = (
  cue: string,
  haptic: string,
  floor: number,
  sounds: ReadonlyArray<string>,
  ms: number,
): FeelRow => ({
  cue,
  haptic,
  floor,
  sounds: sounds.map(soundPath),
  lengths: sounds.map(() => ms),
  gain: 1,
  group: 'feel',
});

/** The dials whose detent thocks: every dial but the key's. */
const THOCKED = ['capo', 'size', 'tempo', 'placement', 'hundreds', 'tens', 'ones'] as const;

/** Every cue's body. */
export const FEEL_ROWS: ReadonlyArray<FeelRow> = [
  felt('section', 'impact-light'),
  felt('wall', 'impact-rigid'),
  felt('reset', 'impact-medium'),
  felt('chords-on', 'impact-light'),
  felt('chords-off', 'impact-light'),
  felt('play', 'impact-light'),
  felt('pause', 'impact-light'),
  felt('switch-on', 'impact-light'),
  felt('switch-off', 'impact-light'),
  felt('favourite-on', 'success'),
  felt('favourite-off', 'impact-light'),
  felt('press', 'selection'),
  felt('choose', 'selection'),
  felt('tab', 'selection'),
  felt('zoom-out', 'impact-soft'),
  felt('zoom-in', 'impact-light'),
  felt('sheet-open', 'impact-light'),
  felt('seek-grab', 'selection'),
  felt('seek-tick', 'selection', FLOOR),
  felt('seek-release', 'impact-soft'),
  felt('rail-tick', 'selection', FLOOR),
  heard('detent-key', 'selection', FLOOR, KEYS, TINE_MS),
  ...THOCKED.map((dial) => heard(`detent-${dial}`, 'selection', FLOOR, ['thock'], THOCK_MS)),
  heard('beat-accent', 'impact-medium', 0, ['thock'], THOCK_MS),
  heard('beat', 'impact-light', 0, ['thock'], THOCK_MS),
];

/** Every sound a row names, each once, in the table's order. */
export const FEEL_SOUNDS: ReadonlyArray<string> = [
  ...new Set(FEEL_ROWS.flatMap((row) => row.sounds)),
];

/** The Feel's source, as `app.ts` registers it: `feelRows()` answers the table. */
export const feelSources = () => ({
  feelRows: () =>
    FEEL_ROWS.map((row) => ({ ...row, sounds: [...row.sounds], lengths: [...row.lengths] })),
});
