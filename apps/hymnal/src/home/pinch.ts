import { useAtomValue } from '@effect/atom-react';
import { usePathname } from 'one';
import { useRef } from 'react';
import { usePinchGesture } from 'react-native-gesture-handler';

import { find, Find } from '~/player/bar';
import { modeAt, searchOpen } from '~/reader/place';

import { pinchAct } from './finding';

export const usePinch = ({
  testID,
  act,
  enabled,
  onCommit,
}: {
  readonly testID: string;
  readonly act: 'zoomOut' | 'zoomIn';
  readonly enabled: boolean;
  readonly onCommit: () => void;
}) => {
  const path = usePathname();
  const searching = modeAt(useAtomValue(searchOpen), path) !== 'off';
  const drums = Find.$is('Open')(useAtomValue(find));
  const committed = useRef(false);
  const ask = (scale: number, velocity: number) => {
    if (committed.current || pinchAct(scale, velocity) !== act) return;
    committed.current = true;
    onCommit();
  };
  return usePinchGesture({
    testID,
    enabled: enabled && !searching && !drums,
    runOnJS: true,
    onBegin: () => {
      committed.current = false;
    },
    onUpdate: ({ scale }) => ask(scale, 0),
    onDeactivate: ({ scale, velocity, canceled }) => {
      if (!canceled) ask(scale, velocity);
    },
  });
};
