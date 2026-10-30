/**
 * About this hymn, as its route renders it: `More like this` lists the
 * hymns nearest the hymn the route names, and a row closes the sheet and
 * opens its hymn. Each check compares hymn numbers.
 */

import { describe, expect, it } from 'bun:test';
import { RegistryContext } from '@effect/atom-react';
import { Array as Arr, Option } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

import AboutRoute from '../../app/(hymnal)/about';
import { params, routed, stack } from '../test/one';
import { readerOn } from '../test/reader';
import { hymnAt } from '~/hymns/hymns';
import { passageQuery, passageText, referencesOf, sameMetre, topicsOf } from '~/hymns/indexes';
import { moreLike } from '~/hymns/meaning';

import { aboutHref, MORE_LIKE } from './About';
import { HymnPage } from './HymnPage';
import { openAtTopic, searchOpen, searchQuery } from './place';

/** The hymn numbers of the rows `More like this` shows, in order. */
const likeRows = (html: string) =>
  [...html.matchAll(/data-testid="about-like-(\d+)"/g)].map((match) => Number(match[1]));

/** The route's params naming `hymn`, and nothing routed yet; the params are cleared when the test's `using` ends. */
const routeTo = (hymn: string) => {
  params['hymn'] = hymn;
  routed.splice(0);
  return { [Symbol.dispose]: () => void delete params['hymn'] };
};

/**
 * The stack under the sheet: `under`, then the sheet, shown; the stack is
 * emptied again when the test's `using` ends.
 */
const sheetOver = (under: ReadonlyArray<{ readonly name: string; readonly params?: object }>) => {
  stack.state = {
    routes: [...under, { name: 'about', params: { hymn: '100' } }],
    index: under.length,
  };
  return { [Symbol.dispose]: () => void (stack.state = { routes: [], index: 0 }) };
};

/** Home, then hymn 100's page: the stack a tap on a hymn in the list leaves. */
const fromHome = [{ name: 'index' }, { name: 'hymns/[number]', params: { number: '100' } }];

/**
 * `node` mounted in the document over a registry of its own, a click on the
 * element `selector` finds, then unmounted; the registry is returned, to read
 * what the click set.
 */
const clickIn = (node: ReactNode, selector: string) => {
  const registry = AtomRegistry.make();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<RegistryContext value={registry}>{node}</RegistryContext>));
  const target = host.querySelector(selector);
  expect(target).not.toBeNull();
  act(() => void target?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })));
  act(() => root.unmount());
  host.remove();
  return registry;
};

/** Whether the sheet's markup has a heading labelled `name`. */
const hasHeading = (html: string, name: string) =>
  new RegExp(
    `role="heading"[^>]*aria-label="${name}"|aria-label="${name}"[^>]*role="heading"`,
  ).test(html);

/** The indexes of the rows with test ids `<prefix>-<n>`, in order. */
const rows = (html: string, prefix: string) =>
  [...html.matchAll(new RegExp(`data-testid="${prefix}-(\\d+)"`, 'g'))].map((match) =>
    Number(match[1]),
  );

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

  it('lists the hymn’s topics, its passages and the other hymns of its metre, each under its heading', () => {
    using _route = routeTo('100');
    const html = renderToStaticMarkup(<AboutRoute />);
    const topics = topicsOf(100);
    const passages = referencesOf(100);
    // Hymn 100 has each: the drive's row reads these three headings on it.
    expect([topics.length, passages.length, sameMetre(100).length].every((n) => n > 0)).toBe(true);
    expect(
      ['Topics', 'Scripture', 'Sing to another tune'].map((name) => hasHeading(html, name)),
    ).toEqual([true, true, true]);
    expect(rows(html, 'about-topic')).toEqual(topics.map((_, i) => i));
    expect(rows(html, 'about-scripture')).toEqual(passages.map((_, i) => i));
    expect(rows(html, 'about-tune')).toEqual([...sameMetre(100)]);
    expect(passages.every((p) => html.includes(`aria-label="${passageText(p)}"`))).toBe(true);
  });

  it('leaves out a section the indexes give nothing for', () => {
    const lone = Array.from({ length: 695 }, (_, i) => i + 1).find(
      (n) => sameMetre(n).length === 0,
    );
    using _route = routeTo(String(lone));
    const html = renderToStaticMarkup(<AboutRoute />);
    expect({
      heading: hasHeading(html, 'Sing to another tune'),
      rows: rows(html, 'about-tune'),
    }).toEqual({
      heading: false,
      rows: [],
    });
  });

  it('leaves out the Scripture section for a hymn the Scriptural index gives no passage', () => {
    const bare = Array.from({ length: 695 }, (_, i) => i + 1).find(
      (n) => referencesOf(n).length === 0,
    );
    expect(bare).toBeDefined();
    using _route = routeTo(String(bare));
    const html = renderToStaticMarkup(<AboutRoute />);
    expect({
      heading: hasHeading(html, 'Scripture'),
      rows: rows(html, 'about-scripture'),
    }).toEqual({
      heading: false,
      rows: [],
    });
  });

  it('closes the sheet and the pages under it and opens the Topics tab at a topic', () => {
    using _route = routeTo('100');
    using _stack = sheetOver(fromHome);
    const registry = clickIn(<AboutRoute />, '[data-testid="about-topic-0"]');
    expect({
      routed,
      topic: registry.get(openAtTopic),
      query: registry.get(searchQuery),
      searching: registry.get(searchOpen),
    }).toEqual({
      routed: ['dismissAll'],
      topic: Option.fromUndefinedOr(topicsOf(100)[0]?.name),
      query: '',
      searching: 'off',
    });
  });

  it('searches for a passage by where it begins', () => {
    using _route = routeTo('100');
    using _stack = sheetOver(fromHome);
    const first = Option.getOrThrow(Arr.head(referencesOf(100)));
    const registry = clickIn(<AboutRoute />, '[data-testid="about-scripture-0"]');
    expect({
      routed,
      query: registry.get(searchQuery),
      searching: registry.get(searchOpen),
    }).toEqual({
      routed: ['dismissAll'],
      query: passageQuery(first),
      searching: 'about',
    });
  });

  it('puts home in place of a hymn a link opened, with nothing under it, and shows the topic there', () => {
    using _route = routeTo('100');
    using _stack = sheetOver([{ name: 'hymns/[number]', params: { number: '100' } }]);
    const registry = clickIn(<AboutRoute />, '[data-testid="about-topic-0"]');
    expect({ routed, topic: Option.isSome(registry.get(openAtTopic)) }).toEqual({
      routed: ['dismissAll', 'replace /'],
      topic: true,
    });
  });

  it('puts home in place of a sheet a link opened, with no screen under it', () => {
    using _route = routeTo('100');
    using _stack = sheetOver([]);
    const registry = clickIn(<AboutRoute />, '[data-testid="about-scripture-0"]');
    expect({ routed, searching: registry.get(searchOpen) }).toEqual({
      routed: ['replace /'],
      searching: 'about',
    });
  });

  it('closes the sheet and opens a hymn of the same metre', () => {
    using _route = routeTo('100');
    const [mate] = sameMetre(100);
    clickIn(<AboutRoute />, `[data-testid="about-tune-${mate}"]`);
    expect(routed).toEqual(['back', `push /hymns/${mate}`]);
  });
});

describe('the head line of a hymn’s page', () => {
  it('gives the section, then the first passage and how many more', () => {
    const many = Array.from({ length: 695 }, (_, i) => i + 1).find(
      (n) => referencesOf(n).length > 1,
    );
    const hymn = Option.getOrThrow(hymnAt(String(many)));
    const passages = referencesOf(hymn.number);
    const first = Option.getOrThrow(Arr.head(passages));
    const html = renderToStaticMarkup(<HymnPage hymn={hymn} reader={readerOn()} />);
    expect(html).toContain(
      `aria-valuetext="${hymn.topic} · ${passageText(first)} +${passages.length - 1}"`,
    );
  });

  it('gives the section and the passage, with no count, for a hymn with one passage', () => {
    const one = Array.from({ length: 695 }, (_, i) => i + 1).find(
      (n) => referencesOf(n).length === 1,
    );
    expect(one).toBeDefined();
    const hymn = Option.getOrThrow(hymnAt(String(one)));
    const only = Option.getOrThrow(Arr.head(referencesOf(hymn.number)));
    const html = renderToStaticMarkup(<HymnPage hymn={hymn} reader={readerOn()} />);
    expect(html).toContain(`aria-valuetext="${hymn.topic} · ${passageText(only)}"`);
  });

  it('gives the section alone for a hymn the Scriptural index gives no passage', () => {
    const bare = Array.from({ length: 695 }, (_, i) => i + 1).find(
      (n) => referencesOf(n).length === 0,
    );
    const hymn = Option.getOrThrow(hymnAt(String(bare)));
    const html = renderToStaticMarkup(<HymnPage hymn={hymn} reader={readerOn()} />);
    expect(html).toContain(`aria-valuetext="${hymn.topic}"`);
  });
});
