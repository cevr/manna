import { hydrate, render } from '@solidjs/web';

import { fixtures } from './fixtures/index.ts';
import { param } from './fixtures/log.ts';

const root = document.getElementById('root');
const name = param('fixture') ?? '';
const fixture = fixtures[name];
if (root && fixture) {
  if (root.hasAttribute('data-served')) {
    (window as unknown as { __served: string }).__served = root.innerHTML;
    hydrate(fixture, root);
  } else {
    render(fixture, root);
  }
  root.setAttribute('data-mounted', '');
} else {
  console.error(`no fixture named "${name}"`);
}
