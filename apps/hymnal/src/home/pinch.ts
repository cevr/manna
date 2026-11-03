/**
 * The pinch on the home list and on its tiles (`All at once`): a pinch in
 * on the list zooms out to the tiles, and a pinch out on the tiles zooms
 * back in. The gesture asks `pinchAct` while the fingers move (velocity 0)
 * and once more as they lift (their velocity), and commits the first time
 * it asks for the act its screen wants, at most once per gesture. No
 * scaling follows the fingers: the tiles' own zoom is the feedback, and
 * the commit's caller plays the zoom's cue.
 *
 * It takes no touch while search is open on the screen or the find drums
 * are open, so a pinch there zooms nothing.
 */

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
  /** The act this screen takes: the list zooms out, the tiles zoom in. */
  readonly act: 'zoomOut' | 'zoomIn';
  /** Whether the screen takes a pinch at all, besides search and the drums. */
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
