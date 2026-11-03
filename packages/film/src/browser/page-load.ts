import { Context, type Effect } from 'effect';

interface PageLoadOps {
  /** Load this page again, at the URL it is on. */
  readonly reload: Effect.Effect<void>;
  /** Load the page at `href`, as a followed link does (Back returns). */
  readonly open: (href: string) => Effect.Effect<void>;
}

export class PageLoad extends Context.Service<PageLoad, PageLoadOps>()(
  '@manna/film/browser/PageLoad',
) {}
