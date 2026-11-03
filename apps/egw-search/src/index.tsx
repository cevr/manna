import { RegistryProvider } from '@manna/atom-solid';
import { layerBrowser } from '@manna/url-state';
import * as UrlAtom from '@manna/url-state/atom';
import { render } from '@solidjs/web';
import { Option } from 'effect';

import { App } from './app.js';
import './styles.css';

const root = Option.fromNullishOr(document.getElementById('root'));
if (Option.isSome(root))
  render(
    () => (
      <RegistryProvider
        initialValues={[[UrlAtom.layer, layerBrowser({ scrollRestoration: 'manual' })]]}
      >
        <App />
      </RegistryProvider>
    ),
    root.value,
  );
