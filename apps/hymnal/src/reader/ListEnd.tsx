/**
 * The space a list keeps after its last row (`endSpace`), from the bottom
 * inset the list meets (`useStackBottom`): over the home indicator with no
 * bar, over the docked bar while it shows. Where the bar's `#` stands higher
 * than that (`useFindRoom`), the space clears the `#` instead. Only this
 * space draws again when the bar or the `#` shows or hides.
 */

import { View } from 'react-native';

import { useFindRoom } from '~/player/context';
import { useStackBottom } from '~/player/StackBottom';

import { endSpace } from './end';

export function ListEnd() {
  const bottom = Math.max(useStackBottom(), useFindRoom());
  return <View testID="list-end" style={{ height: endSpace(bottom) }} />;
}
