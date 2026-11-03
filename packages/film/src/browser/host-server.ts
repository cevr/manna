import { UrlState, layerServer } from '@manna/url-state';
import { Effect, Layer } from 'effect';
import { Clipboard, ClipboardRefused } from './clipboard.ts';
import { Footage } from './footage.ts';
import { Frames } from './frames.ts';
import { Highlights } from './highlights.ts';
import type { BrowserServices } from './host.ts';
import { Keys } from './keys.ts';
import { Media, PlayRefused, type Playable } from './media.ts';
import { PageLoad } from './page-load.ts';
import { Pointer } from './pointer.ts';
import { Viewport } from './viewport.ts';

/** Media a server render made: never measured, never ready; a play is refused, as no browser would play it. */
const unplayable: Playable = {
  time: () => 0,
  duration: () => Number.NaN,
  ready: () => false,
  playing: () => false,
  seeking: () => false,
  ended: () => false,
  seek: () => Effect.void,
  play: Effect.fail(new PlayRefused({ name: 'NotSupportedError' })),
  pause: Effect.void,
  mute: () => {},
  rate: () => {},
  reload: () => {},
  on: () => {},
};

/** The clipboard a server render has: none, so a copy is refused in those words. */
const noClipboard: Layer.Layer<Clipboard> = Layer.succeed(
  Clipboard,
  Clipboard.of({
    copyLink: () =>
      Effect.fail(
        new ClipboardRefused({ reason: 'a page rendered on the server has no clipboard' }),
      ),
  }),
);

/** Loads a server render cannot make: each ignored, and logged. */
const noLoads: Layer.Layer<PageLoad> = Layer.succeed(
  PageLoad,
  PageLoad.of({
    reload: Effect.logDebug('page-load.server.reload.ignored'),
    open: (href) => Effect.logDebug(`page-load.server.open.ignored href=${href}`),
  }),
);

/**
 * The host of a page rendered on the server for a request to `href`, from a
 * browser that keys as a Mac or not (`mac`): its chords labelled as that
 * browser labels them, so the hydrated page reads as the first paint did.
 */
export const ServerHost = {
  layer: (href: string, mac: boolean): Layer.Layer<BrowserServices> =>
    Layer.mergeAll(
      noClipboard,
      Footage.none,
      Frames.layerClock,
      Highlights.none,
      Keys.layerOn(new EventTarget(), mac),
      Media.layerOver(() => unplayable),
      noLoads,
      Pointer.layerOn(new EventTarget()),
      Viewport.layerPhone,
      UrlState.layer.pipe(Layer.provideMerge(layerServer(href))),
    ),
};
