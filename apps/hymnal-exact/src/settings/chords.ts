/**
 * Settings' two chord choices, `Chord style` and `Chord placement`, from
 * the current hymnal's own lists (`chordStyles`, `placements`), in its
 * order and words. The view keeps each as the text tapped (`persist`);
 * `styleOf` and `placementOf` read it back as the current hymnal's store
 * does, the text when it is exactly a choice and else the default (`simple`,
 * `beat`), so a kept text a later build drops reads as a fresh launch.
 */

import { chordStyles, placements } from '@manna/hymnal-app/chord-choices';

/** How chords are spelled: Simple, a plain chord per syllable at most, or Advanced, every chord as compiled. */
export type Style = (typeof chordStyles)[number]['value'];

/** Where chords fall: on the beat, folded simpler, or as the file plays. */
export type Placement = (typeof placements)[number]['value'];

/** The chord style kept text names, else Simple. */
export const styleOf = (kept: string): Style =>
  chordStyles.find((choice) => choice.value === kept)?.value ?? 'simple';

/** The chord placement kept text names, else On the beat. */
export const placementOf = (kept: string): Placement =>
  placements.find((choice) => choice.value === kept)?.value ?? 'beat';

/** One row of a Settings radio group: its choice, its words, whether it is chosen, whether a hairline divides it from the row above. */
export interface ChoiceRow {
  readonly value: string;
  readonly label: string;
  readonly chosen: boolean;
  readonly divided: boolean;
}

/** Both chord groups' rows under the kept texts (lists Exact's generated types read as mutable). */
export interface ChordChoices {
  readonly style: Array<ChoiceRow>;
  readonly placement: Array<ChoiceRow>;
}

const rowsOf = (
  choices: ReadonlyArray<{ readonly value: string; readonly label: string }>,
  chosen: string,
): Array<ChoiceRow> =>
  choices.map((choice, k) => ({
    value: choice.value,
    label: choice.label,
    chosen: choice.value === chosen,
    divided: k > 0,
  }));

export const chordChoices = (style: string, placement: string): ChordChoices => ({
  style: rowsOf(chordStyles, styleOf(style)),
  placement: rowsOf(placements, placementOf(placement)),
});
