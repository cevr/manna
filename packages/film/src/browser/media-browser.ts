import { Media, type Playable, playableOf } from './media.ts';

const pageAudio = (src: string): Playable =>
  // oxlint-disable-next-line effect/noGlobals -- Media's live adapter: the audio the page makes
  playableOf(new Audio(src));

export const mediaLayer = Media.layerOver(pageAudio);
