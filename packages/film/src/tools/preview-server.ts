import { Context } from 'effect';

interface PreviewServerService {
  /** The player's root URL, e.g. `http://localhost:51234/`. */
  readonly url: string;
}

export class PreviewServer extends Context.Service<PreviewServer, PreviewServerService>()(
  '@manna/film/tools/PreviewServer',
) {}
