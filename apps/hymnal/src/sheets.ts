import { Array as Arr } from 'effect';
import type { StackScreenOptions } from 'one';

import { aboutSheetOptions } from './reader/About';
import { chordSheetOptions } from './reader/ChordSheet';
import { cardsOutOfSheets, drawnOver } from './stack';

/** The stack's screens past home, Recent and the hymns, by route name: the sheets and the tuner's modal. */
export const sheets = {
  settings: {
    title: 'Settings',
    headerShown: false,
    presentation: 'formSheet',
    sheetGrabberVisible: true,
    sheetAllowedDetents: [0.5, 1],
  },
  player: {
    title: 'Player',
    headerShown: false,
    presentation: 'formSheet',
    sheetGrabberVisible: true,
    sheetAllowedDetents: [0.5, 1],
  },
  chord: chordSheetOptions,
  about: aboutSheetOptions,
  tuner: { presentation: 'fullScreenModal', headerShown: false, title: 'Tuner' },
} satisfies Record<string, StackScreenOptions>;

/**
 * The stack's router: the routes of `sheets` drawn over the stack (told by
 * their presentation) are never left under a screen drawn in it, so a hymn
 * or Recent opened while a sheet is up takes the sheet's place
 * (`cardsOutOfSheets`).
 */
export const sheetRouter = cardsOutOfSheets(
  new Set(
    Arr.filter(Object.entries(sheets), ([, options]) => drawnOver(options)).map(([name]) => name),
  ),
);
