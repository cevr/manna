/**
 * The home list's tab row, rendered to HTML as the web build renders it:
 * every tab a `tab` VoiceOver can read, the tab in use the one selected.
 */

import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { renderToStaticMarkup } from 'react-dom/server';

import { TabRow, tabRowHeight } from './TabRow';

const html = () =>
  renderToStaticMarkup(
    <RegistryProvider>
      <TabRow names={['Sections', 'Lists', 'Topics']} selected="Lists" onSelect={() => {}} />
    </RegistryProvider>,
  );

/** Each tab's label and whether it is selected, in page order. */
const tabsOf = (page: string) =>
  [
    ...page.matchAll(
      /<[a-z]+ (?=[^>]*role="tab")(?=[^>]*aria-label="([^"]+)")(?=[^>]*aria-selected="(true|false)")[^>]*>/g,
    ),
  ].map(([, label, selected]) => ({ label, selected: selected === 'true' }));

describe('the home tabs row', () => {
  it('shows each tab as a tab, in order, with only the tab in use selected', () => {
    const page = html();
    expect({ list: page.includes('role="tablist"'), tabs: tabsOf(page) }).toEqual({
      list: true,
      tabs: [
        { label: 'Sections', selected: false },
        { label: 'Lists', selected: true },
        { label: 'Topics', selected: false },
      ],
    });
  });

  it('grows with the reader’s text size', () => {
    expect([tabRowHeight(1), tabRowHeight(2)]).toEqual([48, 68]);
  });
});
