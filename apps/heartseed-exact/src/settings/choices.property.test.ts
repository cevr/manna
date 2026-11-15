/* oxlint-disable effect/noNullish -- the current app's appearanceOf reads a missing kept text as undefined. */

/**
 * The choices are the current Heartseed's over their whole domain (spec
 * A1): for every kept text (each choice, each near miss, empty, and seeded
 * arbitrary text) the port reads the choice the current app reads, and it
 * offers the current app's choices in their order. The appearance is read
 * by the current app's own `appearanceOf`. The minutes and the voice are
 * read in the current app by its session's and its voice's services, whose
 * readers are their own (`readMinutes`, `readChoice`): the text when it is
 * exactly one of `MINUTES` or `CHOICES`, else 5 and Her; this test holds
 * the port to that rule over those exported lists. The scheme the sheet
 * sets is the read appearance itself, which Exact's `setScheme` shows as
 * Light, Dark, or the system's scheme for System: the current app's
 * `schemeOf` for every system scheme.
 */

import { describe, expect, it } from 'bun:test';
import { withDataHost } from '@manna/exact-kit/data-host/testing';
import { APPEARANCES, appearanceOf, schemeOf } from '@manna/heartseed/appearance';
import { MINUTES } from '@manna/heartseed/session';
import { CHOICES } from '@manna/heartseed/voice/reading';

import { seeded, type Random } from '../test/random';
import { minutesOf, settingsSources, settingsView, voiceOf } from './choices';

const RUNS = 400;

/** The near misses of a choice's text: its case, its spaces, its quotes, a padded or a longer number. */
const nearMisses = (text: string) => [
  text.toUpperCase(),
  `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`,
  ` ${text}`,
  `${text} `,
  `"${text}"`,
  `0${text}`,
  `${text}.0`,
  `${text}x`,
  text.slice(1),
];

/** Seeded arbitrary text: up to 12 characters from a wide alphabet, digits and letters of the choices among them. */
const arbitrary = (random: Random) =>
  Array.from({ length: random.below(13) }, () =>
    random.pick([...'0125 dghilmnoefrstwyDS"é\u0000Ω-.']),
  ).join('');

/** Every kept text the test tries: each choice of all three settings, its near misses, empty, and arbitrary text. */
const keptTexts = (seed: number) => {
  const random = seeded(seed);
  const choices = [...MINUTES.map(String), ...CHOICES, ...APPEARANCES];
  return [
    '',
    ...choices,
    ...choices.flatMap(nearMisses),
    ...Array.from({ length: RUNS }, () => arbitrary(random)),
  ];
};

const texts = keptTexts(41);

describe('the port reads every kept text as the current app does', () => {
  it('the minutes: exactly one of MINUTES, else 5', () => {
    for (const text of texts)
      expect([text, minutesOf(text)]).toEqual([
        text,
        MINUTES.find((minutes) => String(minutes) === text) ?? 5,
      ]);
  });

  it('the voice: exactly one of CHOICES, else Her', () => {
    for (const text of texts)
      expect([text, voiceOf(text)]).toEqual([
        text,
        CHOICES.find((choice) => choice === text) ?? 'her',
      ]);
  });

  it("the appearance: the current app's appearanceOf, empty read as missing", () => {
    for (const text of texts)
      expect([text, settingsView('', '', text).appearance]).toEqual([text, appearanceOf(text)]);
    expect(settingsView('', '', '').appearance).toBe(appearanceOf(undefined));
  });
});

it("offers the current app's choices, in its order", () => {
  const view = settingsView('', '', '');
  expect(view.minutesOptions.map((option) => option.value)).toEqual(MINUTES.map(String));
  expect(view.voiceOptions.map((option) => option.value)).toEqual([...CHOICES]);
  expect(view.appearanceOptions.map((option) => option.value)).toEqual([...APPEARANCES]);
  expect(view.minutesOptions.map((option) => option.label)).toEqual(
    MINUTES.map((minutes) => `${minutes} min`),
  );
  expect(view.voiceOptions.map((option) => option.label)).toEqual(['Off', 'Her', 'Him']);
  expect(view.appearanceOptions.map((option) => option.label)).toEqual(['System', 'Light', 'Dark']);
});

/** The scheme Exact shows after `setScheme(call)` under the system's `system`: Light and Dark their own, System the system's dark, else light. */
const exactShows = (call: string, system: string) => {
  if (call === 'light' || call === 'dark') return call;
  if (system === 'dark') return 'dark';
  return 'light';
};

it("the scheme shown is schemeOf's, for every kept appearance and every system scheme", () => {
  for (const text of texts)
    for (const system of ['light', 'dark', '', 'no-preference', 'Dark'])
      expect([text, system, exactShows(settingsView('', '', text).appearance, system)]).toEqual([
        text,
        system,
        schemeOf(appearanceOf(text), system),
      ]);
});

it('answers inside the data host, at once', () => {
  const random = seeded(7);
  for (let run = 0; run < RUNS; run++) {
    const kept = [arbitrary(random), random.pick(texts), random.pick(texts)] as const;
    const view = withDataHost(() => settingsSources.settingsOf(kept));
    expect(view).toEqual(settingsView(...kept));
  }
});
