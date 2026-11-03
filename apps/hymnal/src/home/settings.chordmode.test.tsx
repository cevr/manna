/**
 * Acceptance (chordmode A4): the Settings route's `Chords` switch, mounted
 * in a browser's document (`src/test/setup.ts`) over a fresh registry, as a
 * reader opens it from the home screen's gear. A render to HTML would not
 * do: the server render reads each setting's server value (its default), so
 * chords would never read on.
 *
 * - d1 Chords off (at first): the `Chords` heading and one `Chords` switch
 *   reading off; Appearance, Sounds and haptics, the downloads and About
 *   with its credits show; no `Chord style`, no `Chord placement`, no
 *   `Tuner`, even on a device with the ear.
 * - d2 Chords on: the switch reads on; `Chord style` (`Simple` checked) and
 *   `Chord placement` show; the `Tuner` row shows only where the device has
 *   the ear, so it follows chords and the ear together.
 * - d3 Order: Appearance, the `Chords` heading, the switch, then (on) the
 *   chord style and placement, then Sounds and haptics, the downloads and
 *   About.
 * - d4 A tap on the switch turns chords on and the chord rows come in; a
 *   second tap turns them off and they go.
 *
 * The web has no ear (`~/tuner/native`'s `available` is false), so a case
 * that asks for one gives the route `available: true` through `mock.module`
 * while its page is mounted, and gives the module back as the page goes,
 * within the one synchronous case: no other file in the worker sees it.
 *
 * Final path: `apps/hymnal/src/home/settings.chordmode.test.tsx`.
 */

import { describe, expect, it, mock } from 'bun:test';
import { RegistryContext } from '@effect/atom-react';
import { Option } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import Settings from '../../app/(hymnal)/settings';
import { settings } from '~/store';
import * as native from '~/tuner/native';

/** What the device holds: chords on or off, and whether it has the tuner's ear. */
interface Device {
  readonly chords: boolean;
  readonly ear: boolean;
}

/** `~/tuner/native` telling the ear `ear` until the result is disposed, then the module as it was. */
const earOf = (ear: boolean) => {
  const real = { ...native };
  // oxlint-disable-next-line effect/noModuleMocks -- the ear is the device's own boundary, a module constant the route reads; the stand-in lives while one page is mounted in one synchronous case, and the module is given back before any other file in the worker runs.
  mock.module('~/tuner/native', () => ({ ...real, available: ear }));
  return {
    [Symbol.dispose]: () => {
      // oxlint-disable-next-line effect/noModuleMocks -- gives the module back as it was, the same values the real one holds.
      mock.module('~/tuner/native', () => real);
    },
  };
};

/**
 * The route mounted on `device` over a fresh registry. Chords are set on
 * when the device has them on; off is the default, never set.
 */
const mount = (device: Device) => {
  const ear = earOf(device.ear);
  const registry = AtomRegistry.make();
  const unmountChords = registry.mount(settings.chords);
  if (device.chords) registry.set(settings.chords, true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        <Settings />
      </RegistryContext>,
    ),
  );
  const all = (selector: string) => [...host.querySelectorAll(selector)];
  const the = (selector: string) => Option.fromNullishOr(host.querySelector(selector));
  const labelOf = (element: Element) => element.getAttribute('aria-label');
  const SWITCH = 'input[role="switch"][aria-label="Chords"]';
  return {
    /** The page's parts as a reader finds them. */
    reading: () => ({
      headings: all('[role="heading"]')
        .map((heading) => heading.textContent)
        .filter((text) => ['Appearance', 'Chords', 'About'].includes(text)),
      switches: all('input[role="switch"]').map((input) => ({
        label: labelOf(input),
        on: (input as HTMLInputElement).checked,
      })),
      groups: all('[role="radiogroup"]').map(labelOf),
      radios: all('[role="radio"]').map((radio) => ({
        label: labelOf(radio),
        checked: radio.getAttribute('aria-checked') === 'true',
      })),
      chordWords: ['Chord style', 'Chord placement'].filter((words) =>
        host.innerHTML.includes(words),
      ),
      tuner: Option.isSome(the('[aria-label="Tuner"]')),
      rest: ['Download all recordings', 'Delete downloads'].filter((label) =>
        Option.isSome(the(`[aria-label="${label}"]`)),
      ),
      credits: Option.isSome(the('[data-testid="gemma-terms"]')),
    }),
    /**
     * The names of `marks` out of order in the page: one not there, or one
     * whose first element stands at or before a mark listed ahead of it.
     */
    outOfOrder: (marks: ReadonlyArray<{ readonly name: string; readonly at: string }>) => {
      const everything = all('*');
      return marks
        .map(({ name, at }) => ({
          name,
          place: Option.match(
            Option.fromNullishOr(
              all(at).find(
                (element) => !at.includes('role="heading"') || element.textContent === name,
              ),
            ),
            { onNone: () => -1, onSome: (element) => everything.indexOf(element) },
          ),
        }))
        .filter(
          ({ place }, k, places) =>
            place < 0 || places.slice(0, k).some((earlier) => earlier.place >= place),
        )
        .map(({ name }) => name);
    },
    /** The chords as the app holds them. */
    chords: () => registry.get(settings.chords),
    /** A tap on the switch, as a reader's finger flips it; nothing when it is not there. */
    tap: () => Option.map(the(SWITCH), (input) => act(() => (input as HTMLInputElement).click())),
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
      unmountChords();
      registry.dispose();
      ear[Symbol.dispose]();
    },
  };
};

/** The page's parts on `device`, read once mounted. */
const readOn = (device: Device) => {
  using page = mount(device);
  return page.reading();
};

const appearance = [
  { label: 'System', checked: true },
  { label: 'Light', checked: false },
  { label: 'Dark', checked: false },
];

const off = {
  headings: ['Appearance', 'Chords', 'About'],
  switches: [
    { label: 'Chords', on: false },
    { label: 'Sounds and haptics', on: true },
  ],
  groups: ['Appearance'],
  radios: appearance,
  chordWords: [],
  tuner: false,
  rest: ['Download all recordings', 'Delete downloads'],
  credits: true,
};

const on = (ear: boolean) => ({
  ...off,
  switches: [
    { label: 'Chords', on: true },
    { label: 'Sounds and haptics', on: true },
  ],
  groups: ['Appearance', 'Chord style', 'Chord placement'],
  radios: [
    ...appearance,
    { label: 'Simple', checked: true },
    { label: 'Advanced', checked: false },
    { label: 'On the beat', checked: true },
    { label: 'Simpler', checked: false },
    { label: 'As the file plays', checked: false },
  ],
  chordWords: ['Chord style', 'Chord placement'],
  tuner: ear,
});

describe('the Settings route’s Chords switch', () => {
  it('d1 with chords off, at first: the Chords heading and its switch reading off, the app’s own rows, and no chord style, chord placement or Tuner, with the ear or without', () => {
    expect([false, true].map((ear) => readOn({ chords: false, ear }))).toEqual([off, off]);
  });

  it('d2 with chords on: the switch reads on, Chord style (Simple checked) and Chord placement show, and the Tuner row shows only with the ear', () => {
    expect([false, true].map((ear) => readOn({ chords: true, ear }))).toEqual([
      on(false),
      on(true),
    ]);
  });

  it('d3 Appearance, then the Chords heading and switch, then (on) the chord style and placement, then Sounds and haptics, the downloads and About', () => {
    expect(
      [false, true].map((chords) => {
        using page = mount({ chords, ear: true });
        return {
          chords,
          outOfOrder: page.outOfOrder([
            { name: 'Appearance', at: '[role="radiogroup"][aria-label="Appearance"]' },
            { name: 'Chords', at: '[role="heading"]' },
            { name: 'the Chords switch', at: 'input[role="switch"][aria-label="Chords"]' },
            ...((chords && [
              { name: 'Chord style', at: '[role="radiogroup"][aria-label="Chord style"]' },
              { name: 'Chord placement', at: '[role="radiogroup"][aria-label="Chord placement"]' },
            ]) ||
              []),
            {
              name: 'Sounds and haptics',
              at: 'input[role="switch"][aria-label="Sounds and haptics"]',
            },
            { name: 'the downloads', at: '[aria-label="Download all recordings"]' },
            { name: 'About', at: '[role="heading"]' },
          ]),
        };
      }),
    ).toEqual([
      { chords: false, outOfOrder: [] },
      { chords: true, outOfOrder: [] },
    ]);
  });

  it('d4 a tap on the switch turns chords on and brings Chord style and Chord placement in; a second tap turns chords off and they go', () => {
    using page = mount({ chords: false, ear: false });
    const step = () => {
      const { switches, groups } = page.reading();
      return {
        switch: switches.filter(({ label }) => label === 'Chords'),
        chords: page.chords(),
        groups,
      };
    };
    const before = step();
    page.tap();
    const once = step();
    page.tap();
    const twice = step();
    const closed = {
      switch: [{ label: 'Chords', on: false }],
      chords: false,
      groups: ['Appearance'],
    };
    expect({ before, once, twice }).toEqual({
      before: closed,
      once: {
        switch: [{ label: 'Chords', on: true }],
        chords: true,
        groups: ['Appearance', 'Chord style', 'Chord placement'],
      },
      twice: closed,
    });
  });
});
