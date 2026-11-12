/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noNewPromise, eslint/no-await-in-loop -- the drawing seam mounts generated fields through React's promise-based act in happy-dom, yields to Reanimated's animation frame, and reads DOM absence as null. */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';

import type { PlantStage } from '../field';
import { Furrows } from '../field/plot';
import { STAGES } from '../garden';
import { captionOf, HOME_ICONS, type Furrow } from '../home';
import { below, pickOf, random } from '../test/garden-model';
import { setSystem } from '../test/look';
import { entryOf, moving, swayOf, under } from '../test/motion';
import { motionFaults } from '../test/motion-rule';
import { theme, type Scheme } from '../theme';
import { motionOf } from './motion';

const CASES = 12;
const STAGES_DRAWN = ['not planted', ...STAGES] as const;
const by = (top: Element, id: string) => [...top.querySelectorAll(`[data-testid="${id}"]`)];
const delayOf = (delay: Option.Option<number>) =>
  Option.match(delay, { onNone: () => null, onSome: (ms) => ms });

const stageAt = (next: () => number, turn: number, place: number): PlantStage => {
  if (turn === 0) return 'full corn';
  if (turn === 1) {
    if (place < 28) return 'full corn';
    return 'seed';
  }
  if (turn === 2) return 'not planted';
  if (turn === 4) {
    if (place >= 60) return 'full corn';
    return 'seed';
  }
  return pickOf(next, STAGES_DRAWN);
};

/** Small generated fields, plus long, capped and bare fields whose drawings exercise each boundary. */
const fieldAt = (next: () => number, turn: number): readonly Furrow[] => {
  if (turn === 3) return [];
  let rows = 1 + below(next, 3);
  let places = 1 + below(next, 4);
  if (turn === 0) {
    rows = 16;
    places = 1;
  }
  if (turn === 1) {
    rows = 3;
    places = 24;
  }
  if (turn === 2) {
    rows = 2;
    places = 3;
  }
  if (turn === 4) {
    rows = 3;
    places = 21;
  }
  return Array.from({ length: rows }, (_, row): Furrow => {
    const plants = Array.from({ length: places }, (_, place) => {
      const stage = stageAt(next, turn, row * places + place);
      const reference = `Psalms ${row + 1}:${place + 1}`;
      const ready = below(next, 2) === 0;
      let label = `${reference}, ${stage}`;
      if (ready) label += ', ready today';
      return { reference, stage, ready, label };
    });
    return {
      id: `furrow-${row}`,
      source: { _tag: 'Loose' },
      kind: 'other',
      title: `Furrow ${row}`,
      icon: pickOf(next, HOME_ICONS),
      caption: captionOf(plants),
      plants,
    };
  });
};

/** The document's icon/plant motion and names, read below each row and plant button. */
const seen = (host: Element) =>
  by(host, 'row').map((row) => ({
    icon: entryOf(row.querySelector('[data-testid="furrow-icon"]'), row),
    plants: by(row, 'field-plant').map((plant) => {
      const drawing = plant.querySelector('[data-testid="plant-image"],[data-testid="plant-soil"]');
      return {
        name: plant.getAttribute('aria-label'),
        role: plant.getAttribute('role'),
        spring: entryOf(drawing, plant),
        sway: swayOf(drawing, plant),
      };
    }),
  }));

const want = (furrows: readonly Furrow[]) => {
  const motion = motionOf(furrows);
  return furrows.map((furrow, row) => ({
    icon: delayOf(motion[row]?.icon ?? Option.none()),
    plants: furrow.plants.map((plant, place) => ({
      name: plant.label,
      role: 'button',
      spring: delayOf(motion[row]?.plants[place]?.spring ?? Option.none()),
      sway: motion[row]?.plants[place]?.sway ?? false,
    })),
  }));
};

const nextFrame = () =>
  act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

/** The caps as drawn, by their literal values: nothing moves past the 14th furrow, at most 60 springs and 12 sways. */
const expectCaps = (host: Element, turn: number) => {
  for (const [row, node] of by(host, 'row').entries())
    if (row >= 14)
      expect(
        moving(node).map((each) => each.getAttribute('style')),
        `field ${turn} row ${row}`,
      ).toEqual([]);
  const plants = seen(host).flatMap((row) => row.plants);
  expect(plants.filter((plant) => plant.spring !== null).length).toBeLessThanOrEqual(60);
  expect(plants.filter((plant) => plant.sway).length).toBeLessThanOrEqual(12);
};

/** At rest a plant image stays directly in its button, with no redundant animation box. */
const expectRest = (host: Element, furrows: readonly Furrow[]) => {
  const plans = motionOf(furrows);
  for (const [row, node] of by(host, 'row').entries()) {
    for (const [place, plant] of by(node, 'field-plant').entries()) {
      const plan = plans[row]?.plants[place];
      if (plan && Option.isNone(plan.spring) && !plan.sway) {
        expect(moving(plant).map((each) => each.getAttribute('style'))).toEqual([]);
        const image = plant.querySelector('[data-testid="plant-image"]');
        if (image) expect(image.parentNode === plant, `field row ${row} place ${place}`).toBe(true);
      }
    }
  }
};

const checkFields = async (prefers: 'reduce' | 'no-preference') => {
  const next = random(10_204);
  const floors = { furrows: 0, springs: 0, sways: 0, soil: 0, independent: 0 };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  for (let turn = 0; turn < CASES; turn++) {
    let scheme: Scheme = 'light';
    if (turn % 2 === 1) scheme = 'dark';
    const furrows = fieldAt(next, turn);
    await act(async () => {
      setSystem(scheme);
      root.render(
        <View style={{ backgroundColor: theme[scheme].ground }}>
          <Furrows
            key={turn}
            furrows={furrows}
            chosen={Option.none()}
            pending={false}
            onChoose={() => {}}
            onOpen={() => {}}
            onRemove={() => {}}
          />
        </View>,
      );
    });
    await nextFrame();
    if (prefers === 'no-preference') {
      expect(seen(host), `field ${turn}`).toEqual(want(furrows));
      expectRest(host, furrows);
      expectCaps(host, turn);
    } else {
      expect(moving(host).map((node) => node.getAttribute('style'))).toEqual(
        motionOf(furrows).flatMap((row) =>
          row.plants.filter((plant) => plant.sway).map(() => 'transform: rotate(0deg);'),
        ),
      );
      expect(by(host, 'field-plant').map((plant) => plant.getAttribute('aria-label'))).toEqual(
        furrows.flatMap((row) => row.plants.map((plant) => plant.label)),
      );
    }
    expect(motionFaults(host)).toEqual([]);
    const plants = furrows.slice(0, 14).flatMap((row) => row.plants);
    if (furrows.length > 14) floors.furrows++;
    if (plants.filter((plant) => plant.stage !== 'not planted').length > 60) floors.springs++;
    if (plants.filter((plant) => plant.stage === 'full corn').length > 12) floors.sways++;
    if (plants.length > 0 && plants.every((plant) => plant.stage === 'not planted')) floors.soil++;
    if (
      motionOf(furrows).some((row) =>
        row.plants.some((plant) => Option.isNone(plant.spring) && plant.sway),
      )
    )
      floors.independent++;
  }
  await act(async () => root.unmount());
  host.remove();
  for (const [kind, count] of Object.entries(floors)) expect(count, kind).toBeGreaterThanOrEqual(1);
};

describe('home drawings follow the plan', () => {
  it('draws generated furrows with each icon and plant at its own delay and sway, and leaves every named button still', () =>
    under('no-preference', () => checkFields('no-preference')));
  it('enters and hides nothing under Reduce Motion, resting every full-corn sway upright', () =>
    under('reduce', () => checkFields('reduce')));
});
