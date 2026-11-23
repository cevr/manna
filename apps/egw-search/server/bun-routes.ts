/**
 * The Bun server's routes, apart from `./main.ts` so a test serves them as
 * the server does: the built page, the API over its groups, and the packs'
 * CORS (`./pack-cors.ts`).
 *
 * The page is served from the same router as the API. In development Vite
 * owns the UI on its own port and proxies `/api` here, so the page's layer
 * is dead weight; in production there is no Vite, and without it the root
 * would 404 while `/api/search` answered perfectly. `spa: true` sends
 * unknown paths to `index.html`, so a deep link is the client's to route:
 * the page draws its own not-found view for any path but `/`. The API is
 * merged after the static server so a declared route always wins over a
 * file that shares its path.
 */

import { Layer } from 'effect';
import { HttpStaticServer } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';

import { SearchApi } from './api.js';
import { PackCorsLive } from './pack-cors.js';

/** The routes over the API's `groups`, the page read from `staticRoot`. */
export const bunRoutes = <A, E, R>(groups: Layer.Layer<A, E, R>, staticRoot: string) =>
  Layer.mergeAll(
    HttpStaticServer.layer({ root: staticRoot, spa: true, index: 'index.html' }),
    HttpApiBuilder.layer(SearchApi).pipe(Layer.provide(groups)),
    PackCorsLive,
  );
