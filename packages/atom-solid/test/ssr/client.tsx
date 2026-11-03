import { layerBrowser } from '@manna/url-state';
import * as UrlAtom from '@manna/url-state/atom';
import { hydrate } from '@solidjs/web';
import { Option } from 'effect';

import { RegistryProvider } from '../../src/registry-context.ts';
import { App } from './App.tsx';

Option.map(Option.fromNullishOr(document.getElementById('root')), (root) =>
  hydrate(
    () => (
      <RegistryProvider initialValues={[[UrlAtom.layer, layerBrowser()]]}>
        <App />
      </RegistryProvider>
    ),
    root,
  ),
);
