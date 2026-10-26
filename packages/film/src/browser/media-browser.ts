// The page's own media (`media.ts`): the `Audio` it makes for its narration,
// and its compares on `<video>`.

import { Media, type Playable, playableOf } from './media.ts';

/** The audio at `src`, as the page makes it: an `Audio` element. */
const pageAudio = (src: string): Playable =>
  // oxlint-disable-next-line effect/noGlobals -- Media's live adapter: the audio the page makes
  playableOf(new Audio(src));

/** The page's media: its narration an `Audio` element, its compares on `<video>`. */
export const mediaLayer = Media.layerOver(pageAudio);
