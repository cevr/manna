import { UrlState, layerBrowser } from '@manna/url-state';
import { Layer } from 'effect';
import { type FootageCopy, footageHref } from '../core/footage.ts';
import type { BrowserServices } from './host.ts';
import type { Frames } from './frames.ts';
import type { Media } from './media.ts';
import type { Viewport } from './viewport.ts';
import { clipboardLayer } from './clipboard-browser.ts';
import { FootageDecoders, footageLayer } from './footage-browser.ts';
import { framesLayer } from './frames-browser.ts';
import { highlightsLayer } from './highlights-browser.ts';
import { keysLayer } from './keys-browser.ts';
import { mediaLayer } from './media-browser.ts';
import { pageLoadLayer } from './page-load-browser.ts';
import { pointerLayer } from './pointer-browser.ts';
import { viewportLayer } from './viewport-browser.ts';

const addressLayer = UrlState.layer.pipe(Layer.provideMerge(layerBrowser()));

const hostWith = (
  media: Layer.Layer<Media, never, Frames | Viewport>,
  copy: FootageCopy = 'proxy',
): Layer.Layer<BrowserServices> =>
  Layer.mergeAll(
    clipboardLayer,
    footageLayer((source) => footageHref(source, copy)).pipe(Layer.provide(FootageDecoders.layer)),
    framesLayer,
    highlightsLayer,
    keysLayer,
    media.pipe(Layer.provide(Layer.merge(framesLayer, viewportLayer))),
    pageLoadLayer,
    pointerLayer,
    viewportLayer,
    addressLayer,
  );

export const BrowserHost = {
  layer: hostWith(mediaLayer),
  render: hostWith(mediaLayer, 'mezzanine'),
};
