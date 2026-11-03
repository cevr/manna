import type { Skeleton } from '@manna/film/core';
import { bustSkeleton } from '../../../cutout/bust.ts';
import { framed, type Rooted } from '../../../cutout/skeleton.ts';
import { FRAMES, type FramedView, keptAt } from './frames.ts';

const footOf = (view: FramedView) => FRAMES[view].kept[3] - FRAMES[view].kept[1];

const HEAD = ['head'];
const LEAN = ['lean'];
const DRAPED = ['lean', 'head'];

const dressed = (bust: Rooted, house: Skeleton['skin']): Rooted => ({
  ...bust,
  skin: { ...house, ...bust.skin },
});

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
