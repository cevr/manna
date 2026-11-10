/**
 * A planted verse's stage drawn still with the home's hand-drawn set, as
 * Today's stage line (28 pt) and the first minute's Planted (112 pt) show
 * it: one image of the scheme now inside a wrapper hidden from the screen
 * reader, which reads the stage line instead. The artwork carries its own
 * soil, so nothing is drawn around it.
 */

import { Image, View } from 'react-native';

import type { Stage } from '../garden';
import type { HomeIcon } from '../home';
import { useScheme } from '../look';
import { ICON_IMAGES } from './icons';

/** The image each planted stage is drawn with: full corn as `corn`. */
const DRAWING: Readonly<Record<Stage, HomeIcon>> = {
  seed: 'seed',
  blade: 'blade',
  ear: 'ear',
  'full corn': 'corn',
};

/** The two sizes a plant is drawn at, in points: Today's stage line, and Planted. */
export type PlantSize = 28 | 112;

/** A planted stage's image, `size` points square in the scheme now; its own source stands in while it loads, so no frame draws it blank. */
export function PlantImage({ stage, size }: { readonly stage: Stage; readonly size: PlantSize }) {
  const source = ICON_IMAGES[DRAWING[stage]][useScheme()];
  const box = { width: size, height: size };
  return (
    <View testID="plant" aria-hidden style={box}>
      <Image
        testID="plant-image"
        aria-hidden
        source={source}
        defaultSource={source}
        resizeMode="contain"
        style={box}
      />
    </View>
  );
}
