/* oxlint-disable effect/noAsyncFunction, effect/noNullish -- a screen test: it mounts the two screens through React's promise-based act in happy-dom and reads DOM absence as null. */

/**
 * The two screens before the first verse (`./intro`), mounted on their own
 * for the first run and the replay, in both schemes: one heading; exactly
 * their controls (the welcome's `Begin` and `Skip`; how a verse grows'
 * `Plant your first verse` on the first run, `See your field` in the
 * replay), each outside the scroll view and each tap reaching its own
 * handler alone; the welcome's growing seed and line; the second screen's
 * four hidden drawings in order over their four names; the passage's
 * reference exactly once on the first run's welcome and nowhere else;
 * `Mark 4:28` and no three words running of the passage; and every text
 * at 4.5:1 on its ground.
 */

import { describe, expect, it } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import passage from 'virtual:heartseed-passage';

import { AA, contrastOf } from '../test/contrast';
import { scrolled } from '../test/field-rig';
import { setSystem } from '../test/look';
import { introFaults } from '../test/plant-image-rule';
import { theme, type Scheme } from '../theme';
import { Grows, Welcome, type IntroRun } from './intro';

const CONTROLS = '[role="button"],[role="radio"],[role="checkbox"],[role="link"]';

const text = (node: Element | null | undefined) =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
const nameOf = (node: Element) => node.getAttribute('aria-label') ?? text(node);

/** Every run of three of the passage's words, lowercased. */
const TRIGRAMS = (() => {
  const words = passage.text.toLowerCase().match(/[a-z']+/g) ?? [];
  return words.slice(2).map((word, index) => `${words[index]} ${words[index + 1]} ${word}`);
})();

/** What a screen shows of itself: its headings, its controls by name and where they sit, its references, its texts. */
const readScreen = (host: Element) => {
  const controls = [...host.querySelectorAll(CONTROLS)];
  const leaves = [...host.querySelectorAll('*')].filter(
    (node) => node.children.length === 0 && text(node) !== '',
  );
  return {
    headings: [...host.querySelectorAll('[role="heading"]')].map(text),
    controls: controls.map(nameOf).toSorted(),
    scrolled: controls.filter(scrolled).map(nameOf),
    references: [...host.querySelectorAll('[data-testid="reference"]')].map(text),
    texts: leaves.map(text),
    faint: leaves.filter((node) => contrastOf(node) < AA).map(text),
  };
};

/** Mounts `node` on the scheme's ground; the answer unmounts. */
const mount = async (node: React.ReactNode, scheme: Scheme) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    setSystem(scheme);
    root.render(<View style={{ backgroundColor: theme[scheme].ground }}>{node}</View>);
  });
  return {
    host,
    tap: async (label: string) => {
      const control = [...host.querySelectorAll(CONTROLS)].find((each) => nameOf(each) === label);
      await act(async () => (control as HTMLElement | undefined)?.click());
    },
    leave: async () => {
      await act(async () => root.unmount());
      host.remove();
      setSystem('light');
    },
  };
};

const RUNS: readonly IntroRun[] = ['first', 'replay'];
/** The references the welcome shows, by run: the passage's on the first run alone. */
const REFERENCES: Readonly<Record<IntroRun, readonly string[]>> = {
  first: [passage.reference],
  replay: [],
};
/** How a verse grows' one button, by run, written apart from the screen. */
const ONWARD: Readonly<Record<IntroRun, string>> = {
  first: 'Plant your first verse',
  replay: 'See your field',
};
const SCHEMES: readonly Scheme[] = ['light', 'dark'];

describe('the welcome', () => {
  for (const run of RUNS)
    for (const scheme of SCHEMES)
      it(`shows Heartseed with the growing seed, its line, Begin and Skip on the ${run} run in ${scheme}`, async () => {
        const taps: string[] = [];
        const shown = await mount(
          <Welcome run={run} onBegin={() => taps.push('begin')} onSkip={() => taps.push('skip')} />,
          scheme,
        );
        const seen = readScreen(shown.host);
        expect({
          headings: seen.headings,
          controls: seen.controls,
          scrolled: seen.scrolled,
          references: seen.references,
          line: seen.texts.includes('Plant a verse. Say it from memory. Watch it grow.'),
          first: seen.texts.includes('Your first verse'),
          verse: TRIGRAMS.filter((each) => seen.texts.join(' ').toLowerCase().includes(each)),
          faint: seen.faint,
          drawn: introFaults(shown.host, 'welcome', scheme),
        }).toEqual({
          headings: ['Heartseed'],
          controls: ['Begin', 'Skip'],
          scrolled: [],
          references: [...REFERENCES[run]],
          line: true,
          first: run === 'first',
          verse: [],
          faint: [],
          drawn: [],
        });
        await shown.tap('Begin');
        await shown.tap('Skip');
        expect(taps).toEqual(['begin', 'skip']);
        await shown.leave();
      });
});

describe('how a verse grows', () => {
  for (const run of RUNS)
    for (const scheme of SCHEMES)
      it(`shows Every verse is a plant with the four stages, Mark 4:28 and its one button on the ${run} run in ${scheme}`, async () => {
        const taps: string[] = [];
        const shown = await mount(<Grows run={run} onOn={() => taps.push('on')} />, scheme);
        const seen = readScreen(shown.host);
        const button = ONWARD[run];
        expect({
          headings: seen.headings,
          controls: seen.controls,
          scrolled: seen.scrolled,
          references: seen.references,
          names: seen.texts.filter((each) => ['seed', 'blade', 'ear', 'full corn'].includes(each)),
          mark: seen.texts.includes('Mark 4:28'),
          line: seen.texts.includes(
            'Say it from memory and it grows. Each day the app brings back the ones that are ready.',
          ),
          verse: TRIGRAMS.filter((each) => seen.texts.join(' ').toLowerCase().includes(each)),
          faint: seen.faint,
          drawn: introFaults(shown.host, 'grows', scheme),
        }).toEqual({
          headings: ['Every verse is a plant'],
          controls: [button],
          scrolled: [],
          references: [],
          names: ['seed', 'blade', 'ear', 'full corn'],
          mark: true,
          line: true,
          verse: [],
          faint: [],
          drawn: [],
        });
        await shown.tap(button);
        expect(taps).toEqual(['on']);
        await shown.leave();
      });
});
