import { View } from 'react-native';

import { useFindRoom } from '~/player/context';
import { useStackBottom } from '~/player/StackBottom';

import { listEndSpace } from './end';

export function ListEnd() {
  const space = listEndSpace(useStackBottom(), useFindRoom());
  return <View testID="list-end" style={{ height: space }} />;
}
