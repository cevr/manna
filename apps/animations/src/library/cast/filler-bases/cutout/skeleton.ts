import type { Skeleton } from '@manna/film/core';
import { bustSkeleton } from '../../../cutout/bust.ts';
import { framed, type Rooted } from '../../../cutout/skeleton.ts';
import { FRAMES, type FramedView, keptAt } from './frames.ts';

/** A view's foot: its kept box's height, crown to waist, where the lean rises from. */
const footOf = (view: FramedView) => FRAMES[view].kept[3] - FRAMES[view].kept[1];

/** A house part's bones: on the head alone, on the lean alone, or draped over both. */
const HEAD = ['head'];
const LEAN = ['lean'];
const DRAPED = ['lean', 'head'];

/** A bust's skeleton with its view's house parts' skins added beside its head's and torso's. */
const dressed = (bust: Rooted, house: Skeleton['skin']): Rooted => ({
  ...bust,
  skin: { ...house, ...bust.skin },
});

/** Each cut view's skeleton, in its part sheet's frame. */
export const SKELETONS = {
  'poses-1': framed(
    keptAt('poses-1'),
    dressed(bustSkeleton([151, 223], footOf('poses-1')), {
      beard: HEAD,
      band: HEAD,
      headwear: DRAPED,
      mantle: LEAN,
    }),
  ),
  'poses-2': framed(
    keptAt('poses-2'),
    dressed(bustSkeleton([140, 219], footOf('poses-2')), { mantle: DRAPED }),
  ),
  'poses-3': framed(
    keptAt('poses-3'),
    dressed(bustSkeleton([150, 220], footOf('poses-3')), {
      beard: HEAD,
      headwear: DRAPED,
      mantle: LEAN,
    }),
  ),
  'poses-4': framed(
    keptAt('poses-4'),
    dressed(bustSkeleton([141, 220], footOf('poses-4')), { mantle: DRAPED }),
  ),
} as const satisfies Readonly<Record<FramedView, Skeleton>>;
