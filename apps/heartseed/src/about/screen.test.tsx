/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noNodeBuiltinImport, eslint/no-await-in-loop -- a React screen test: it drives the root in happy-dom through React's promise-based `act` over the device's disk, one launch after another, reads the vendored licence from disk to hold the screen to it, and reads a node's absent attributes as null. */

/**
 * About as a reader and a screen reader meet it, through the field bar's
 * rig (`src/test/bar-rig.tsx`), which holds every frame to the root's frame
 * rule and the screens' rules (one heading, no control but a list control
 * inside a scroll view, every text at AA, every field control disabled
 * while a remove is pending, `Listening` only on Today).
 *
 * The launch opens home: its Settings sheet (`src/test/settings-rig.ts`,
 * whose `watchSheet` holds the sheet's frames) holds one `About` button,
 * at least 44 tall; its tap shows the one heading `About`, the credits
 * word for word, the licence equal to `native/natural/kokoro/LICENSE` byte
 * for byte, one `Your field` button outside the scroll view and no
 * `Voice`, each text at AA; the way back shows the field, and a relaunch
 * opens home again; nothing is written. About holds no appearance and no
 * foot, its one control the way back, and home's foot holds no `About`
 * (the sheet's appearance is `src/settings`'s). A recital that starts
 * while About shows brings Today back. The bundle's module serves the
 * licence as `vite/licence.ts` prints it.
 */

import { useAtomSet } from '@effect/atom-react';
import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import passage from 'virtual:heartseed-passage';

import { readLicence } from '../../vite/licence';
import { passage as plugin } from '../../vite/plugin';
import { press } from '../app';
import { mountBar } from '../test/bar-rig';
import { labelOf, text } from '../test/chooser-rig';
import { AA, contrastOf } from '../test/contrast';
import { recallOf } from '../test/field-model';
import { record, scrolled } from '../test/field-rig';
import { device } from '../test/one';
import { modalOf, openSettings, sheetControl, tapInSheet, watchSheet } from '../test/settings-rig';
import { CREDITS } from './screen';

/** The credits as the owner wrote them, held here so that a changed or dropped sentence on the screen fails. */
const PARAGRAPH =
  'Natural voice: Kokoro-82M by hexgrad (Apache-2.0), with its voices af_heart and am_michael. Core ML conversion by laishere (kokoro-coreml, Apache-2.0), packaged by FluidInference (FluidAudio, Apache-2.0). Pronunciations from Misaki by hexgrad (Apache-2.0).';

const LICENCE = readFileSync(
  new URL('../../native/natural/kokoro/LICENSE', import.meta.url),
  'utf8',
);

const CONTROL = '[role="button"],[role="radio"],[role="checkbox"],[role="switch"]';

type Bar = Awaited<ReturnType<typeof mountBar>>;

/** Today's press as the root's registry runs it, caught from a component beside the root. */
interface Presser {
  press: (shown: { readonly piece: typeof passage; readonly item: Option.Option<never> }) => void;
}

const headings = (rig: Bar) => [...rig.host.querySelectorAll('[role="heading"]')].map(text);

const named = (rig: Bar, label: string) =>
  [...rig.host.querySelectorAll(CONTROL)].filter((node) => labelOf(node) === label);

/** Every node that holds text of its own, below its contrast at AA, by its text's start. */
const faint = (host: Element) =>
  [...host.querySelectorAll('*')]
    .filter((node) =>
      [...node.childNodes].some(
        (child) => child.nodeType === 3 && (child.textContent ?? '').trim(),
      ),
    )
    .filter((node) => contrastOf(node) < AA)
    .map((node) => text(node).slice(0, 20));

/** A launch over a planted verse, so home opens, with the reader's Voice Off under the old key, and `extra` records. */
const launchWith = (extra: readonly (readonly [string, string])[] = []) =>
  device.launch([
    record(recallOf('Made 1:1', Date.UTC(2026, 9, 1), 3, 0)),
    ['heartseed/voice/enabled', 'false'],
    ...extra,
  ]);

/** Waits for the launch's home, its gear drawn. */
const toField = async (rig: Bar) => {
  expect(
    await rig.until(
      () => headings(rig).join('|') === 'Your field' && named(rig, 'Settings').length > 0,
    ),
  ).toBe(true);
};

/** Taps the open sheet's `About` and waits for About. */
const toAbout = async (rig: Bar) => {
  expect(await tapInSheet('About')).toBe(true);
  expect(await rig.until(() => headings(rig).join('|') === 'About')).toBe(true);
};

describe('About', () => {
  it('opens from the Settings sheet’s About: the credits word for word, the licence whole, the way back, a relaunch on home, nothing written', async () => {
    launchWith();
    const start = new Map(device.disk);
    const sheet = watchSheet();
    const rig = await mountBar(0, false);
    await toField(rig);
    await openSettings(rig);
    expect(
      [sheetControl('About')]
        .filter((node) => node !== undefined)
        .map((node) => ({
          role: node.getAttribute('role'),
          tall: parseFloat(getComputedStyle(node).minHeight) >= 44,
          words: text(node),
          disabled: node.getAttribute('aria-disabled'),
        })),
    ).toEqual([{ role: 'button', tall: true, words: 'About', disabled: null }]);

    await toAbout(rig);
    const credits = [...rig.host.querySelectorAll('[data-testid="about-credits"]')];
    const licences = [...rig.host.querySelectorAll('[data-testid="about-licence"]')];
    expect({
      headings: headings(rig),
      credits: credits.map((node) => node.textContent),
      exported: CREDITS,
      licence: licences.map((node) => node.textContent === LICENCE),
      length: licences.map((node) => (node.textContent ?? '').length),
      back: named(rig, 'Your field').map((node) => ({
        role: node.getAttribute('role'),
        scrolled: scrolled(node),
        words: text(node),
      })),
      voice: rig.host.querySelectorAll('[aria-label="Voice"]').length,
      faint: faint(rig.host),
    }).toEqual({
      headings: ['About'],
      credits: [PARAGRAPH],
      exported: PARAGRAPH,
      licence: [true],
      length: [11_357],
      back: [{ role: 'button', scrolled: false, words: '‹ Your field' }],
      voice: 0,
      faint: [],
    });

    await rig.tap('Your field');
    await toField(rig);
    await openSettings(rig);
    await toAbout(rig);
    sheet.stop();
    expect({ rig: rig.faults, sheet: sheet.faults }).toEqual({ rig: [], sheet: [] });
    await rig.leave();

    device.launch();
    const again = await mountBar(0, false);
    expect(await again.until(() => headings(again).length > 0)).toBe(true);
    expect({ headings: headings(again), faults: again.faults }).toEqual({
      headings: ['Your field'],
      faults: [],
    });
    await again.leave();
    expect(new Map(device.disk)).toEqual(start);
  });

  it('holds no appearance and no foot of its own, home’s foot holds no About, and only the way back is a control', async () => {
    launchWith();
    const rig = await mountBar(0, false);
    await toField(rig);
    const foot = [...rig.host.querySelectorAll('[data-testid="foot"]')].map((node) =>
      [...node.querySelectorAll(CONTROL)].map(labelOf),
    );
    await openSettings(rig);
    await toAbout(rig);
    expect({
      foot,
      groups: [...document.querySelectorAll('[role="radiogroup"]')].map(labelOf),
      aboutFoot: document.querySelectorAll('[data-testid="about-foot"]').length,
      controls: [...rig.host.querySelectorAll(CONTROL)].map(labelOf),
      modal: modalOf(),
      faults: rig.faults,
    }).toEqual({
      foot: [['Begin']],
      groups: [],
      aboutFoot: 0,
      controls: ['Your field'],
      modal: null,
      faults: [],
    });
    await rig.leave();
  });

  it('gives way to Today when a recital starts while it shows', async () => {
    launchWith();
    const presser: Presser = { press: () => undefined };
    function CatchPress() {
      presser.press = useAtomSet(press);
      return null;
    }
    const rig = await mountBar(0, false, <CatchPress />);
    await toField(rig);
    await openSettings(rig);
    await toAbout(rig);
    await act(async () => presser.press({ piece: passage, item: Option.none() }));
    expect(await rig.until(() => headings(rig).includes('Today'))).toBe(true);
    expect({ headings: headings(rig), faults: rig.faults }).toEqual({
      headings: ['Today'],
      faults: [],
    });
    await rig.leave();
  });

  it('reaches the bundle as the script prints it, the vendored file byte for byte', () => {
    expect(readLicence() === LICENCE).toBe(true);
    const loaded = String(plugin().load('\0virtual:heartseed-licence'));
    expect(loaded.startsWith('export default ')).toBe(true);
    const served: unknown = JSON.parse(loaded.slice('export default '.length).replace(/;$/, ''));
    expect({
      served: served === LICENCE,
      resolved: plugin().resolveId('virtual:heartseed-licence'),
    }).toEqual({
      served: true,
      resolved: '\0virtual:heartseed-licence',
    });
  });
});
