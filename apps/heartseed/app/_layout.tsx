import { Slot } from 'one';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

/** Every route under the gesture handler's root view, so a screen's gesture (the reading view's hold) is recognized. */
export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Slot />
    </GestureHandlerRootView>
  );
}
