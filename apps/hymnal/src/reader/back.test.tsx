import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { Option } from 'effect';
import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import Search from '../../app/(hymnal)/index';
import { opened } from '../test/one';
import { readerOn } from '../test/reader';
import { hymnAt, hymns } from '~/hymns/hymns';

import { HymnList } from './HymnList';
import { HymnPage } from './HymnPage';
import { hymnsOffset } from './place';

const mount = (node: ReactNode) => {
  opened.splice(0);
  const host = document.createElement('div');
  document.body.append(host);
  const root: Root = createRoot(host);
  act(() => root.render(node));
  return {
    root,
    host,
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

const click = (element: Element, keys: { readonly metaKey?: boolean } = {}) => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...keys });
  act(() => void element.dispatchEvent(event));
  return event.defaultPrevented;
};

const row = (host: HTMLElement, label: string) =>
  Option.getOrThrow(Option.fromNullishOr(host.querySelector(`[aria-label="${label}"]`)));

const rows = (host: HTMLElement) =>
  [...host.querySelectorAll('[role="link"][aria-label]')].map((r) => r.getAttribute('aria-label'));

const type = (host: HTMLElement, text: string) => {
  const field = Option.getOrThrow(Option.fromNullishOr(host.querySelector('input')));
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setValue?.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('moving between screens on the web', () => {
  it('opens a hymn from its row inside the app, never by loading the page anew', () => {
    using app = mount(
      <RegistryProvider>
        <HymnList hymns={hymns.slice(0, 3)} hrefOf={(n) => `/hymns/${n}`} offset={hymnsOffset} />
      </RegistryProvider>,
    );
    const handled = click(row(app.host, '2, All Creatures of Our God and King'));
    expect({ handled, opened }).toEqual({ handled: true, opened: ['/hymns/2'] });
  });

  it('leaves a Cmd-click on a row to the browser, which opens the hymn in a new tab', () => {
    using app = mount(
      <RegistryProvider>
        <HymnList hymns={hymns.slice(0, 3)} hrefOf={(n) => `/hymns/${n}`} offset={hymnsOffset} />
      </RegistryProvider>,
    );
    const link = row(app.host, '2, All Creatures of Our God and King');
    const handled = click(link, { metaKey: true });
    expect({ tag: link.tagName, href: link.getAttribute('href'), handled, opened }).toEqual({
      tag: 'A',
      href: '/hymns/2',
      handled: false,
      opened: [],
    });
  });

  it('comes back from a hymn to the search as the reader left it', () => {
    const inApp = (screen: ReactNode) => <RegistryProvider>{screen}</RegistryProvider>;
    using app = mount(inApp(<Search />));
    const { root, host } = app;
    type(host, 'shepherd');
    const left = rows(host);
    expect(left[0]).toBe('55, Jesus Tender Shepherd Hear Me');

    act(() =>
      root.render(inApp(<HymnPage hymn={Option.getOrThrow(hymnAt('545'))} reader={readerOn()} />)),
    );
    act(() => root.render(inApp(<Search />)));

    expect(host.querySelector('input')?.value).toBe('shepherd');
    expect(rows(host)).toEqual(left);
  });
});
