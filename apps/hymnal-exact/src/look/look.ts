/**
 * The appearance setting's choices, in the order Settings offers them: how
 * the app is shown, as the system is set or always light or always dark.
 * The view keeps the choice as Contract's `persist` state and hands the
 * host's `setScheme` the kept text; the rules below read that text back,
 * list the rows Settings shows, and say which scheme each choice shows.
 * `look.test.ts` holds them to the current hymnal's (`Appearance` in
 * `apps/hymnal/src/settings.ts`, the web's `applyAppearance`).
 */
export const looks = ['system', 'light', 'dark'] as const;

export type Look = (typeof looks)[number];

/** A scheme a screen is drawn in. */
export type Scheme = 'light' | 'dark';

const labels = { system: 'System', light: 'Light', dark: 'Dark' } as const satisfies Record<
  Look,
  string
>;

/** The choice kept text names: one of the three, else following the system, as a fresh launch does. */
export const lookOf = (kept: string): Look => looks.find((look) => look === kept) ?? 'system';

/** The scheme a choice shows while the system shows `system`. */
export const shownOf = (look: Look, system: Scheme): Scheme => {
  const shown: Record<Look, Scheme> = { system, light: 'light', dark: 'dark' };
  return shown[look];
};

/** One of Settings' Appearance rows: its choice, its words, and whether the kept text chose it. */
export interface LookRow {
  readonly value: Look;
  readonly label: string;
  readonly chosen: boolean;
}

/** Settings' Appearance rows under the kept text (a list Exact's generated types read as mutable). */
export const lookRows = (kept: string): Array<LookRow> => {
  const chosen = lookOf(kept);
  return looks.map((value) => ({ value, label: labels[value], chosen: value === chosen }));
};
