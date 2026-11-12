import { Stack } from 'one';
import { StyleSheet, View } from 'react-native';

import { LivePlayer } from '~/player/LivePlayer';
import { PlayerBar } from '~/player/PlayerBar';
import { StackBottom } from '~/player/StackBottom';
import { stackHeaders } from '~/reader/screen';
import { sheetRouter, sheets } from '~/sheets';
import { useStackOptions } from '~/stack';
import { color } from '~/color';
import { WebStackHeader } from '~/web/WebStackHeader';
import { webOnly } from '~/web/webOnly';

/**
 * The app's one stack: the home screen, which draws its own title (no
 * native header), each hymn and the Recent list pushed over it, and Settings
 * the player sheet (which holds the reader's settings too), the chord
 * sheet (how to play a tapped chord) and About this hymn (the hymns like
 * it) as sheets.
 * A hymn or Recent opened while a sheet is up (by a link) closes
 * the sheet and is pushed where it was (`sheetRouter`): pushed over the
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
            <Stack screenOptions={useStackOptions(stackHeaders)} router={sheetRouter}>
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
