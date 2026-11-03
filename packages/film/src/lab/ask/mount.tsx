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
