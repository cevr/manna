import { Context, type Effect } from 'effect';

interface PageLoadOps {
  readonly reload: Effect.Effect<void>;
  readonly open: (href: string) => Effect.Effect<void>;
}

export class PageLoad extends Context.Service<PageLoad, PageLoadOps>()(
  '@manna/film/browser/PageLoad',
) {}
