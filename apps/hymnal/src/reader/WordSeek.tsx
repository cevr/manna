/**
 * The held seek's touch on the web: the sung words as they are; the page's
 * `Seek by line or word` controls hold and step.
 */

import { View } from 'react-native';

import type { SeekAreaProps } from './word-seek';

export function SeekArea({ style, children }: SeekAreaProps) {
  return (
    <View testID="reader-word-seek-area" style={style}>
      {children}
    </View>
  );
}
