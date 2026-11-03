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
