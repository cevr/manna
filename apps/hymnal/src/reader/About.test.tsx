/**
 * About this hymn, as its route renders it: `More like this` lists the
 * hymns nearest the hymn the route names, and a row closes the sheet and
 * opens its hymn. Each check compares hymn numbers.
 */

import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { Option } from 'effect';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

import AboutRoute from '../../app/(hymnal)/about';
import { params, routed } from '../test/one';
import { readerOn } from '../test/reader';
import { hymnAt } from '~/hymns/hymns';
import { moreLike } from '~/hymns/meaning';

import { aboutHref, MORE_LIKE } from './About';
import { HymnPage } from './HymnPage';

/** The hymn numbers of the rows `More like this` shows, in order. */
const likeRows = (html: string) =>
  [...html.matchAll(/data-testid="about-like-(\d+)"/g)].map((match) => Number(match[1]));

/** The route's params naming `hymn`, and nothing routed yet; the params are cleared when the test's `using` ends. */
const routeTo = (hymn: string) => {
  params['hymn'] = hymn;
  routed.splice(0);
  return { [Symbol.dispose]: () => void delete params['hymn'] };
};

/** `node` mounted in the document, a click on the element `selector` finds, then unmounted. */
const clickIn = (node: ReactNode, selector: string) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<RegistryProvider>{node}</RegistryProvider>));
  const target = host.querySelector(selector);
  act(() => void target?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })));
  act(() => root.unmount());
  host.remove();
};

describe('About this hymn', () => {
  it('is the sheet route of the hymn it names', () => {
    expect(String(aboutHref(100))).toBe('/about?hymn=100');
  });

  it('lists under More like this the hymns nearest the hymn, nearest first', () => {
    using _route = routeTo('100');
    const html = renderToStaticMarkup(<AboutRoute />);
    // The heading is drawn in capitals; its label, which VoiceOver reads and the drive matches, is not.
    expect(html).toMatch(
      /role="heading"[^>]*aria-label="More like this"|aria-label="More like this"[^>]*role="heading"/,
    );
    expect(likeRows(html)).toEqual([...moreLike(100, MORE_LIKE)]);
  });

  it('says so when its route names no hymn', () => {
    using _route = routeTo('9999');
    const html = renderToStaticMarkup(<AboutRoute />);
    expect({ rows: likeRows(html).length, none: html.includes('No hymn') }).toEqual({
      rows: 0,
      none: true,
    });
  });

  it('opens from the quiet line at the head of a hymn’s page', () => {
    using _route = routeTo('');
    const hymn = Option.getOrThrow(hymnAt('100'));
    clickIn(
      <HymnPage hymn={hymn} reader={readerOn()} />,
      '[role="button"][aria-label="About this hymn"]',
    );
    expect(routed).toEqual(['push /about?hymn=100']);
  });

  it('closes the sheet and opens the hymn a row names', () => {
    using _route = routeTo('100');
    const first = moreLike(100, 1)[0] ?? 0;
    clickIn(<AboutRoute />, `[data-testid="about-like-${first}"]`);
    expect(routed).toEqual(['back', `push /hymns/${first}`]);
  });
});
