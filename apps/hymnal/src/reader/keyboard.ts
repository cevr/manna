import { Keyboard, type FlatListProps } from 'react-native';

export const dismissal: Pick<FlatListProps<unknown>, 'keyboardDismissMode' | 'onTouchMove'> = {
  keyboardDismissMode: 'none',
  onTouchMove: () => Keyboard.dismiss(),
};
