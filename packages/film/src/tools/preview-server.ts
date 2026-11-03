import { Context } from 'effect';

interface PreviewServerService {
  readonly url: string;
}

export class PreviewServer extends Context.Service<PreviewServer, PreviewServerService>()(
  '@manna/film/tools/PreviewServer',
) {}
