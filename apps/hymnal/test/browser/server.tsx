/* oxlint-disable effect/noGlobals, effect/noAsyncFunction -- the browser test's server, a host boundary: Bun's loader takes each stand-in module as source text, and the app is imported once its boundaries are in place. */

import { plugin } from 'bun';
import { renderToString } from 'react-dom/server';

import { readIndexes } from '../../vite/indexes';
import { readWords } from '../../vite/words';

export const data = {
  'virtual:hymnal': JSON.stringify(readWords()),
  'virtual:hymnal-indexes': JSON.stringify(readIndexes()),
} satisfies Readonly<Record<string, string>>;

plugin({
  name: 'hymnal-server-boundaries',
  setup(build) {
    const web = Bun.resolveSync('react-native-web', import.meta.dir);
    build.module('react-native', () => ({
      contents: `export * from ${JSON.stringify(web)};`,
      loader: 'js',
    }));
    const one = Bun.resolveSync('../../src/test/one.tsx', import.meta.dir);
    build.module('one', () => ({
      contents: `export * from ${JSON.stringify(one)};`,
      loader: 'js',
    }));
    for (const [name, json] of Object.entries(data))
      build.module(name, () => ({
        contents: `export default ${json};`,
        loader: 'js',
      }));
  },
});

const { App } = await import('./app');
const { AppRegistry } = await import('react-native');
const { webColors } = await import('~/color');

AppRegistry.registerComponent('styles', () => () => <></>);

export const render = (path: string): string => {
  const body = renderToString(<App path={path} />);
  // @ts-expect-error react-native-web's own API, as `app/_layout.tsx` calls it
  const styles: string = renderToString(AppRegistry.getApplication('styles', {}).getStyleElement());
  return [
    '<!doctype html><html lang="en-US"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style>${webColors}\n#root { display: flex; flex-direction: column; flex: 1; min-height: 0; }</style>`,
    styles,
    `</head><body><div id="root">${body}</div>`,
    '<script type="module" src="/page.js"></script></body></html>',
  ].join('');
};
