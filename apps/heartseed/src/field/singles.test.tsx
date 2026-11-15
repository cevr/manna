/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noGlobals -- a React screen test: it drives the root through the bar rig's promise-based taps, reads happy-dom nodes whose absent attributes are null, and writes and compares the stored key as JSON text. */

/**
 * Home's `Single verses` (hsminlist) through the root, over the bar rig
 * (`src/test/bar-rig.tsx`, every frame held to the root's rules): a device
 * holding the promise and Proverbs 4:23 planted alone a minute back,
 * neither due yet, its recall kept.
 * The section reads `Single verses`, the promise first, then the verse
 * planted alone; only that verse offers `Remove Proverbs 4:23`, whose tap
 * asks in place (`Remove Proverbs 4:23? Its plant stays in your field.`),
 * `Keep` takes the ask back, a refused `Remove` leaves the alert
 * `Proverbs 4:23 was not removed. Try again.` with the stored single verses
 * as they were, and a landed one stores none, the verse still on home as a
 * plant no list names, with no `Remove`. A verse's tap opens Today on it.
 *
 * It catches a single verse drawn as a list (an `Open`), a `Remove` on the
 * app's own verse, an ask that does not come back on `Keep`, a refused
 * remove that changes the store, and a remove that loses the plant.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { SINGLES_KEY } from '../passages';
import { mountBar } from '../test/bar-rig';
import { labelOf, text } from '../test/chooser-rig';
import { recallOf } from '../test/field-model';
import { record } from '../test/field-rig';
import { device } from '../test/one';

const AT = Date.UTC(2026, 9, 1, 10);
const MINUTE = 60_000;
const VERSE = { book: 20, chapter: 4, first: 23, last: 23 };

/** What home's single verses show now: the label, each verse's button name, each `Remove`, the ask and the alert. */
const singlesOf = (host: Element) => {
  const section = host.querySelector('[data-testid="singles"]');
  const buttons = [...(section?.querySelectorAll('[role="button"]') ?? [])].map(labelOf);
  return {
    verses: [...(section?.querySelectorAll('[data-testid="field-plant"]') ?? [])].map(labelOf),
    removes: buttons.filter((label) => label.startsWith('Remove ')),
    ask: text(section?.querySelector('[data-testid="single-ask"]')),
    alert: text(section?.querySelector('[data-testid="single-alert"]')),
  };
};

describe('home’s single verses', () => {
  it('asks, keeps, refuses and lands a remove of a verse planted alone, the promise with none, and starts a verse by its tap', async () => {
    device.launch([
      record(recallOf(passage.reference, AT - MINUTE, 3, 0)),
      record(recallOf('Proverbs 4:23', AT - MINUTE, 3, 0)),
      [SINGLES_KEY, JSON.stringify([VERSE])],
    ]);
    const rig = await mountBar(0, false, null, { now: AT });
    const seen = () => singlesOf(rig.host);
    expect(await rig.until(() => seen().verses.length === 2)).toBe(true);
    const opens = [...rig.host.querySelectorAll('[role="button"]')]
      .map(labelOf)
      .filter((label) => label.startsWith('Open '));
    const first = seen();
    const label = text(rig.host.querySelector('[data-testid="singles"]')).startsWith(
      'Single verses',
    );
    expect(await rig.tap('Remove Proverbs 4:23')).toBe(true);
    expect(await rig.until(() => seen().ask !== '')).toBe(true);
    const asked = seen();
    expect(await rig.tap('Keep')).toBe(true);
    expect(await rig.until(() => seen().ask === '')).toBe(true);
    const kept = seen();
    expect(await rig.tap('Remove Proverbs 4:23')).toBe(true);
    device.fail('set', 1);
    expect(await rig.tap('Remove')).toBe(true);
    expect(await rig.until(() => seen().alert !== '')).toBe(true);
    device.fail('set', 0);
    const refused = { ...seen(), stored: device.disk.get(SINGLES_KEY) };
    expect(await rig.tap('Remove Proverbs 4:23')).toBe(true);
    expect(await rig.tap('Remove')).toBe(true);
    expect(await rig.until(() => seen().removes.length === 0)).toBe(true);
    const landed = { ...seen(), stored: device.disk.get(SINGLES_KEY) };
    expect(await rig.tap(landed.verses[1] ?? '')).toBe(true);
    expect(
      await rig.until(() =>
        [...rig.host.querySelectorAll('[role="heading"]')].map(text).includes('Today'),
      ),
    ).toBe(true);
    expect({
      opens,
      label,
      first,
      asked,
      kept,
      refused,
      landed,
      faults: rig.faults,
    }).toEqual({
      opens: [],
      label: true,
      first: {
        verses: [`${passage.reference}, seed`, 'Proverbs 4:23, seed'],
        removes: ['Remove Proverbs 4:23'],
        ask: '',
        alert: '',
      },
      asked: {
        verses: [`${passage.reference}, seed`, 'Proverbs 4:23, seed'],
        removes: [],
        ask: 'Remove Proverbs 4:23? Its plant stays in your field.',
        alert: '',
      },
      kept: {
        verses: [`${passage.reference}, seed`, 'Proverbs 4:23, seed'],
        removes: ['Remove Proverbs 4:23'],
        ask: '',
        alert: '',
      },
      refused: {
        verses: [`${passage.reference}, seed`, 'Proverbs 4:23, seed'],
        removes: ['Remove Proverbs 4:23'],
        ask: '',
        alert: 'Proverbs 4:23 was not removed. Try again.',
        stored: JSON.stringify([VERSE]),
      },
      landed: {
        verses: [`${passage.reference}, seed`, 'Proverbs 4:23, seed'],
        removes: [],
        ask: '',
        alert: '',
        stored: '[]',
      },
      faults: [],
    });
    await rig.leave();
  });
});
