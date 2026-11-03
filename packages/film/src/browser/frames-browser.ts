import { Frames } from './frames.ts';

/** The page's animation frames. */
export const framesLayer = Frames.layerOver((run) => {
  // oxlint-disable-next-line effect/noGlobals -- Frames' live adapter: the browser's animation frames
  const id = requestAnimationFrame(run);
  // oxlint-disable-next-line effect/noGlobals -- Frames' live adapter: a frame no longer asked for
  return () => cancelAnimationFrame(id);
});
