import { Array as Arr } from 'effect';
import { Stack, type StackScreenOptions } from 'one';
import { StyleSheet, View } from 'react-native';

import { LivePlayer } from '~/player/LivePlayer';
import { PlayerBar } from '~/player/PlayerBar';
import { StackBottom } from '~/player/StackBottom';
import { aboutSheetOptions } from '~/reader/About';
import { chordSheetOptions } from '~/reader/ChordSheet';
import { stackHeaders } from '~/reader/screen';
import { cardsOutOfSheets, drawnOver, useStackOptions } from '~/stack';
import { color } from '~/color';
import { WebStackHeader } from '~/web/WebStackHeader';
import { webOnly } from '~/web/webOnly';

/** The stack's screens past home and Recent, by route name: the sheets and the tuner's modal. */
const sheets = {
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

/** The routes drawn over the stack, so never left under a screen drawn in it. */
const over = new Set(
  Arr.filter(Object.entries(sheets), ([, options]) => drawnOver(options)).map(([name]) => name),
);

/**
 * The app's one stack: the home screen, which draws its own title (no
 * native header), each hymn and the Recent list pushed over it, and Settings
 * the player sheet (which holds the reader's settings too), the chord
 * sheet (how to play a tapped chord) and About this hymn (the hymns like
 * it) as sheets.
 * A hymn or Recent opened while a sheet is up (by a link) closes
 * the sheet and is pushed where it was (`cardsOutOfSheets`): pushed over the
 * sheet it would be drawn inside it, over the docked bar.
 * The player plays on across every screen; while it holds a hymn its bar is
 * docked under the stack, above the home indicator (`PlayerBar`): the stack
 * ends on the bar's resting height, and the bar, its spring and its dials lie
 * over the column. While it holds none, a hymn page draws the bar
 * as its own, so the bar moves with the page's push and back. The screens are
 * told the bottom inset they meet as the docked bar shows or hides
 * (`StackBottom`).
 */
export default function HymnalLayout() {
  return (
    <LivePlayer>
      <View style={styles.column}>
        <View style={styles.stack}>
          <StackBottom>
            <Stack screenOptions={useStackOptions(stackHeaders)} router={cardsOutOfSheets(over)}>
              <Stack.Screen name="index" options={{ title: 'Hymns', headerShown: false }} />
              <Stack.Screen name="recent" options={{ title: 'Recent' }} />
              {Object.entries(sheets).map(([name, options]) => (
                <Stack.Screen key={name} name={name} options={options} />
              ))}
              {webOnly(<WebStackHeader root="/" title="Hymns" />)}
            </Stack>
          </StackBottom>
        </View>
        <PlayerBar />
      </View>
    </LivePlayer>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, minHeight: 0, backgroundColor: color.ground },
  stack: { flex: 1, minHeight: 0 },
});
