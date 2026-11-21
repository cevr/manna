/**
 * Writes `nearest.gen.ts` (ignored; `nearest.gen.d.ts` declares it), every
 * hymn's `More like this` (`nearest.ts`), as `src/hymns/make.ts` imports it
 * before each Exact command. A build-time host step under Bun, never in the
 * data module; it writes only when the text changes.
 */

import { writeGenerated } from '@manna/exact-kit/prepare';

import { nearestRows, nearestText } from './nearest.ts';

writeGenerated(new URL('./nearest.gen.ts', import.meta.url).pathname, nearestText(nearestRows()));
