import { LabClient } from '../api.ts';
import { mountStudio } from '../page-client.tsx';
import { ASK_PAGE, askOn } from './page.tsx';

export const mountAsk = (): void =>
  mountStudio({
    page: ASK_PAGE,
    event: 'ask.mounted',
    on: (host) => askOn(host, LabClient.layer),
  });
