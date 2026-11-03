import { generateHydrationScript, renderToString } from '@solidjs/web';

import { fixtures } from './fixtures/index.ts';

export const render = (name: string): { head: string; html: string } | undefined => {
  const fixture = fixtures[name];
  if (fixture === undefined) {
    return undefined;
  }
  return { head: generateHydrationScript(), html: renderToString(fixture) };
};
