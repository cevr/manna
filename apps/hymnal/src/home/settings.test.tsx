/**
 * The Settings route, the sheet the home screen's gear opens, rendered to
 * HTML as the web build renders it.
 */

import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { renderToStaticMarkup } from 'react-dom/server';

import Settings from '../../app/(hymnal)/settings';

const html = () =>
  renderToStaticMarkup(
    <RegistryProvider>
      <Settings />
    </RegistryProvider>,
  );

/** Each radio's label and whether it is checked, in page order. */
const radiosOf = (page: string) =>
  [
    ...page.matchAll(
      /<div (?=[^>]*role="radio")[^>]*aria-checked="(true|false)"[^>]*>(?:<[^>]+>)*([^<]+)</g,
    ),
  ].map(([, checked, label]) => ({ label, checked: checked === 'true' }));

describe('the Settings route', () => {
  it('shows its heading, the Appearance choices with System checked, then the Chord style choices with Simple checked, at first', () => {
    const page = html();
    expect({
      heading: page.includes('>Settings<'),
      groups: [
        ...page.matchAll(/<div (?=[^>]*role="radiogroup")(?=[^>]*aria-label="([^"]+)")/g),
      ].map(([, label]) => label),
      chords: page.includes('>Chords<'),
      downloads: ['Downloads', 'Download all recordings', 'Delete downloads'].every((label) =>
        page.includes(label),
      ),
      radios: radiosOf(page),
    }).toEqual({
      heading: true,
      groups: ['Appearance', 'Chord style', 'Chord placement'],
      chords: true,
      downloads: true,
      radios: [
        { label: 'System', checked: true },
        { label: 'Light', checked: false },
        { label: 'Dark', checked: false },
        { label: 'Simple', checked: true },
        { label: 'Advanced', checked: false },
        { label: 'On the beat', checked: true },
        { label: 'Simpler', checked: false },
        { label: 'As the file plays', checked: false },
      ],
    });
  });

  it('holds the switch Sounds and haptics, on at first, after the chord style and before About', () => {
    const page = html();
    const at = (text: string) => page.indexOf(text);
    expect({
      on: /<input (?=[^>]*aria-label="Sounds and haptics")(?=[^>]*checked)/.test(page),
      after: at('aria-label="Sounds and haptics"') > at('aria-label="Advanced"'),
      before: at('aria-label="Sounds and haptics"') < at('>About<'),
    }).toEqual({ on: true, after: true, before: true });
  });

  it('names each radio by its label, so a tap by label finds it on the web', () => {
    const page = html();
    expect(
      [...page.matchAll(/<div (?=[^>]*role="radio")(?=[^>]*aria-label="([^"]+)")/g)].map(
        ([, label]) => label,
      ),
    ).toEqual([
      'System',
      'Light',
      'Dark',
      'Simple',
      'Advanced',
      'On the beat',
      'Simpler',
      'As the file plays',
    ]);
  });
});
