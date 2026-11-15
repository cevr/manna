/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noNewPromise, effect/noTernary, eslint/no-await-in-loop -- the drawing seam mounts generated fields through React's promise-based act in happy-dom, yields to Reanimated's animation frame, presses through react-native-web's keyboard press, and reads DOM absence as null. */

/**
 * Home's furrows as drawn, over generated fields in light and dark, with
 * Reduce Motion off and on: a row holds no image (no icon beside its
 * title), each plant is one button named as its furrow names it, holding a
 * gold dot exactly when ready over one dash, `ink` once planted and `soil`
 * before, and no image or text; nothing moves; and each plant and each
 * `Open <title>` shows the `hearing` fill while pressed and none after.
 */

import { describe, expect, it } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';

import type { PlantStage } from '../field';
import { Furrows } from '../field/plot';
import { STAGES } from '../garden';
import { captionOf, HOME_ICONS, type Furrow } from '../home';
import { below, pickOf, random } from '../test/garden-model';
import { computed, setSystem } from '../test/look';
import { moving, under } from '../test/motion';
import { theme, type Scheme } from '../theme';

const CASES = 10;
const STAGES_DRAWN = ['not planted', ...STAGES] as const;
const by = (top: Element, id: string) => [...top.querySelectorAll(`[data-testid="${id}"]`)];

/** Small generated fields, plus a long bare one and an empty one. */
const fieldAt = (next: () => number, turn: number): readonly Furrow[] => {
  if (turn === 3) return [];
  let rows = 1 + below(next, 3);
  let places = 1 + below(next, 5);
  if (turn === 2) {
    rows = 2;
    places = 14;
  }
  return Array.from({ length: rows }, (_, row): Furrow => {
    const plants = Array.from({ length: places }, (_, place) => {
      const stage: PlantStage = turn === 2 ? 'not planted' : pickOf(next, STAGES_DRAWN);
      const reference = `Psalms ${row + 1}:${place + 1}`;
      const ready = below(next, 2) === 0;
      let label = `${reference}, ${stage}`;
      if (ready) label += ', ready today';
      return { reference, stage, ready, label };
    });
    return {
      id: `furrow-${row}`,
      source: { _tag: 'Own' },
      kind: 'own',
      title: `Furrow ${row}`,
      icon: pickOf(next, HOME_ICONS),
      caption: captionOf(plants),
      plants,
    };
  });
};

const nextFrame = () =>
  act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

const hidden = (node: Element) => node.closest('[aria-hidden="true"]') !== null;
const fill = (node: Element) => getComputedStyle(node).backgroundColor;

/** Each row as drawn: its images, its title's button, and each plant's name, role, dot, dash and what else it holds. */
const seen = (host: Element, scheme: Scheme) =>
  by(host, 'row').map((row) => ({
    images: row.querySelectorAll('img').length,
    open: [...row.querySelectorAll('[role="button"]')]
      .filter((node) => node.getAttribute('data-testid') !== 'field-plant')
      .map((node) => node.getAttribute('aria-label')),
    plants: by(row, 'field-plant').map((plant) => {
      const dashes = [
        ...plant.querySelectorAll('[data-testid="plant-sown"],[data-testid="plant-soil"]'),
      ];
      const dash = dashes[0];
      let drawn = `<${dashes.length} dashes>`;
      if (dashes.length === 1 && dash !== undefined && hidden(dash)) {
        if (fill(dash) === computed(theme[scheme].ink)) drawn = 'ink';
        if (fill(dash) === computed(theme[scheme].soil)) drawn = 'soil';
        drawn = `${dash.getAttribute('data-testid')}:${drawn}`;
      }
      return {
        name: plant.getAttribute('aria-label'),
        role: plant.getAttribute('role'),
        exposed: !hidden(plant),
        dots: by(plant, 'dot').filter(hidden).length,
        drawn,
        extra: plant.querySelectorAll('img').length + plant.textContent.trim().length,
      };
    }),
  }));

const want = (furrows: readonly Furrow[]) =>
  furrows.map((furrow) => ({
    images: 0,
    open: [`Open ${furrow.title}`],
    plants: furrow.plants.map((plant) => ({
      name: plant.label,
      role: 'button',
      exposed: true,
      dots: plant.ready ? 1 : 0,
      drawn: plant.stage === 'not planted' ? 'plant-soil:soil' : 'plant-sown:ink',
      extra: 0,
    })),
  }));

const key = (node: Element, type: string, name: string) =>
  node.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key: name }));

/** Each control's fill held pressed (a space down on it), then let go (an Enter up on the page, no tap), as `<name>: <pressed>/<after>`. */
const presses = async (host: Element, scheme: Scheme) => {
  const out: string[] = [];
  const named = (paint: string) => (paint === computed(theme[scheme].hearing) ? 'hearing' : 'none');
  for (const node of host.querySelectorAll('[role="button"]')) {
    await act(async () => key(node, 'keydown', ' '));
    const pressed = named(fill(node));
    await act(async () => key(document.body, 'keyup', 'Enter'));
    out.push(`${node.getAttribute('aria-label')}: ${pressed}/${named(fill(node))}`);
  }
  return out;
};

const checkFields = async () => {
  const next = random(10_204);
  const floors = { planted: 0, bare: 0, ready: 0, empty: 0 };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  for (let turn = 0; turn < CASES; turn++) {
    const scheme: Scheme = turn % 2 === 1 ? 'dark' : 'light';
    const furrows = fieldAt(next, turn);
    const tapped: string[] = [];
    await act(async () => {
      setSystem(scheme);
      root.render(
        <View style={{ backgroundColor: theme[scheme].ground }}>
          <Furrows
            key={turn}
            furrows={furrows}
            onPlant={(reference) => tapped.push(reference)}
            onOpen={(id) => tapped.push(id)}
          />
        </View>,
      );
    });
    await nextFrame();
    expect(seen(host, scheme), `field ${turn}`).toEqual(want(furrows));
    expect(
      moving(host).map((node) => node.getAttribute('style')),
      `field ${turn}`,
    ).toEqual([]);
    expect(await presses(host, scheme), `field ${turn}`).toEqual(
      furrows.flatMap((furrow) => [
        `Open ${furrow.title}: hearing/none`,
        ...furrow.plants.map((plant) => `${plant.label}: hearing/none`),
      ]),
    );
    expect(tapped, `field ${turn}`).toEqual([]);
    const plants = furrows.flatMap((row) => row.plants);
    if (plants.some((plant) => plant.stage !== 'not planted')) floors.planted++;
    if (plants.some((plant) => plant.stage === 'not planted')) floors.bare++;
    if (plants.some((plant) => plant.ready)) floors.ready++;
    if (furrows.length === 0) floors.empty++;
  }
  await act(async () => root.unmount());
  host.remove();
  for (const [kind, count] of Object.entries(floors)) expect(count, kind).toBeGreaterThanOrEqual(1);
};

describe('home furrows as drawn', () => {
  it('draws no icon, a dot and a dash per plant, moves nothing, and fills each plant and title hearing while pressed', () =>
    under('no-preference', checkFields));
  it('draws the same, still, under Reduce Motion', () => under('reduce', checkFields));
});
