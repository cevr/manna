// The ask page's browser entry (`/asks/<ask>`, `/asks/page/<page>`, served by
// `film lab`): the page of asks (`page.tsx`) over the browser's host, mounted
// as every lab page is (`mountStudio`): hydrated over the markup the lab
// rendered it with on the server (`server.tsx`), or rendered anew.

import { LabClient } from '../api.ts';
import { mountStudio } from '../page-client.tsx';
import { ASK_PAGE, askOn } from './page.tsx';

/**
 * Mount the ask page into the page, with its styles, over the page's host
 * (`browser/host.ts`), with its commands and their one key listener
 * (`command/hub.ts`).
 */
export const mountAsk = (): void =>
  mountStudio({
    page: ASK_PAGE,
    event: 'ask.mounted',
    on: (host) => askOn(host, LabClient.layer),
  });
