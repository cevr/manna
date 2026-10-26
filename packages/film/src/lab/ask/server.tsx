// The ask page's server entry (`@manna/film/ask-server`, the default export
// of an app's `ask.server.tsx`): the page of asks (`page.tsx`) rendered by
// the lab for one request (`core/page-render.ts`), over a host of the
// request (`ServerHosted`: its URL, no window) and a client of the lab that
// reads through the render's own reads, so each read the page makes is read
// once, here, and sent with the page for the browser to adopt.

import { Effect } from 'effect';
import type { PageRender } from '../../core/page-render.ts';
import { LabClient } from '../api.ts';
import { ServerHosted, pageRender } from '../page-server.tsx';
import { ASK_PAGE, askOn } from './page.tsx';

/** The ask page as the lab renders it on the server. */
export const askRender: PageRender = pageRender({
  ...ASK_PAGE,
  app: (request) => (
    <ServerHosted
      asked={request}
      app={(host) => Effect.runSync(askOn(host, LabClient.layerRendering(request))).app()}
    />
  ),
});
