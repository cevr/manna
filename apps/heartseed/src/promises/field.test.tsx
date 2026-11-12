/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop -- the case mounts the root route in happy-dom's document through React's promise-based `act`, handing each turn over until the frame it waits on lands, at most 3 s, and reads nodes whose absent attributes are null. */

/**
 * The field's taught row as a reader meets it (F1, T3): the root route over
 * the app's own layer, its `promises` part `TAUGHT` or left out, over a
 * device holding the promise, a Fear verse said, a verse no row names and
 * Psalms 91:1-16 held. Taught, the field shows the promise's row, the held
 * passage, the `Protection & Fear` row of its 14 verses, then the other
 * plant, each plant's label as `fieldRule` over `fieldPassagesModel` gives
 * it, each row with its `Open <title>` and none a `Remove`; opened, only
 * the held passage's own page offers `Remove` (hslist L3); left out, the
 * field shows no taught row.
 */

import { RegistryProvider } from '@effect/atom-react';
import { describe, expect, it } from 'bun:test';
import { Effect, Layer, Logger, Option } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import passage from 'virtual:heartseed-passage';

import Root from '../../app/index';
import { appLayer, runtime } from '../app';
import { recite, scriptedSource } from '../dictation/script';
import { Chime } from '../garden';
import { TAUGHT } from '../promises';
import { Haptics } from '../sayit';
import { store } from '../store';
import { voiceSource } from '../voice/source';
import { clockOf, START } from '../test/clock';
import { fieldRule, heldOn, recallOf } from '../test/field-model';
import { readField, record } from '../test/field-rig';
import { DAY } from '../test/garden-model';
import { deadline } from '../test/elapsed';
import { device } from '../test/one';
import { fieldPassagesModel } from '../test/promise-model';

const HELD = { book: 19, chapter: 91, first: 1, last: 16 };

/** The field's rows a reader gets on the launch's home, and the buttons it offers, over a layer teaching `promises`. */
const fieldShown = async (promises: readonly string[] | undefined) => {
  const now = START;
  device.launch([
    record(recallOf(passage.reference, now - 2 * DAY, 3, 0)),
    record(recallOf('Psalms 91:4', now - DAY, 3, 0)),
    record(recallOf('Psalms 56:3', now - DAY + 1, 1, 0)),
    record(recallOf('Genesis 1:1', now - DAY + 2, 3, 0)),
    ['heartseed/passages', JSON.stringify([HELD])],
  ]);
  const parts = {
    source: scriptedSource(recite(passage.text, { skip: [10], every: 5, pace: 3 })),
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
    store,
    chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
    voice: voiceSource,
  };
  const layer = Option.match(Option.fromUndefinedOr(promises), {
    onNone: () => appLayer(parts),
    onSome: (ids) => appLayer({ ...parts, promises: ids }),
  }).pipe(Layer.provideMerge(Layer.merge(clockOf({ now }), Logger.layer([]))));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <RegistryProvider initialValues={[[runtime.layer, layer]]}>
        <Root />
      </RegistryProvider>,
    ),
  );
  const labels = () =>
    [...host.querySelectorAll('[role="button"]')].map((node) => node.getAttribute('aria-label'));
  const until = async (holds: () => boolean) => {
    const late = deadline(3000);
    while (!holds() && !late()) await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    return holds();
  };
  expect(await until(() => host.querySelector('[data-testid="row"]') !== null)).toBe(true);
  const rows = readField(host).rows.map((row) => ({
    title: row.title,
    plants: row.plants.map((plant) => plant.label),
  }));
  const home = labels().filter((label) => /^(Remove|Open) /u.test(label ?? ''));
  const removes: string[] = [];
  const opens = [...host.querySelectorAll('[role="button"]')].filter((node) =>
    node.getAttribute('aria-label')?.startsWith('Open '),
  ).length;
  for (let at = 0; at < opens; at++) {
    const open = [...host.querySelectorAll('[role="button"]')].filter((node) =>
      node.getAttribute('aria-label')?.startsWith('Open '),
    )[at];
    await act(async () => {
      open?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(await until(() => host.querySelector('[data-testid="list-screen"]') !== null)).toBe(
      true,
    );
    removes.push(
      ...labels()
        .filter((label) => label?.startsWith('Remove'))
        .map(String),
    );
    const back = [...host.querySelectorAll('[role="button"]')].find(
      (node) => node.getAttribute('aria-label') === 'Your field',
    );
    await act(async () => {
      back?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(await until(() => host.querySelector('[data-testid="row"]') !== null)).toBe(true);
  }
  await act(async () => root.unmount());
  host.remove();
  return { rows, home, removes };
};

/** The rows the rule gives over the disk, the collections `taught` taught. */
const wantRows = (taught: readonly string[]) =>
  fieldRule(
    heldOn(device.disk),
    fieldPassagesModel(
      [{ title: passage.reference, verses: [passage.reference] }],
      { tag: 'Read', passages: [HELD] },
      taught,
    ),
  ).rows.map((row) => ({
    title: row.title,
    plants: row.plants.map((plant) => `${plant.reference}, ${plant.stage}`),
  }));

describe('the field’s taught row', () => {
  it('shows Protection & Fear after the held passage with its 14 verses, only the held passage’s own page offering Remove, Psalms 91:4 in both rows; left out, no taught row', async () => {
    const taught = await fieldShown(TAUGHT);
    expect(taught.rows).toEqual(wantRows(TAUGHT));
    expect(taught.rows.map((row) => [row.title, row.plants.length])).toEqual([
      [passage.reference, 1],
      ['Psalms 91:1-16', 16],
      ['Protection & Fear', 14],
      ['Genesis 1:1', 1],
    ]);
    expect(taught.home).toEqual([
      `Open ${passage.reference}`,
      'Open Psalms 91:1-16',
      'Open Protection & Fear',
      'Open Genesis 1:1',
    ]);
    expect(taught.removes).toEqual(['Remove Psalms 91:1-16']);

    const left = await fieldShown(undefined);
    expect(left.rows).toEqual(wantRows([]));
    expect(left.rows.map((row) => row.title)).toEqual([
      passage.reference,
      'Psalms 91:1-16',
      'Psalms 56:3',
      'Genesis 1:1',
    ]);
    expect(left.home).toEqual(left.rows.map((row) => `Open ${row.title}`));
    expect(left.removes).toEqual(['Remove Psalms 91:1-16']);
  });
});
