/* oxlint-disable effect/noNullish, effect/noAsyncFunction, effect/noGlobals -- a React screen test: it drives the root in happy-dom through the need rig's promise-based taps over a disk in a plain map, parses the recalls written as plain JSON, and reads a node's absent attributes as null. */

/**
 * When I need… as a reader and a screen reader meet it (N1, N2, L1, X1),
 * through the need rig (`src/test/need-rig.tsx`), which holds every frame
 * to the root's frame rule and the screens' rules: one heading;
 * `Listening` only on Today and never beside `When I need…`;
 * `When I need…` only on home, outside its scroll view and at least 44
 * tall; on When I need… no control in the scroll view but a promise, the
 * bar's `Your field` outside it, every control at least 44 tall, every
 * text at AA, and no node of Today or the field.
 *
 * - After the first minute the launch opens home, whose bar offers
 *   `When I need…` first; its screen holds the heading, the card
 *   `Protection & Fear` with `12 still to learn` and the card `Strength`
 *   with `Isaiah 41:10`, each title plain text. Left out of the layer, the
 *   taught card is gone and `Strength` stays.
 * - A tap on a known promise of another collection shows Today on it with
 *   `Say it`, no `Listen` and no `When I need…`; Today's `Your field` then
 *   `Begin`, and When I need…'s `Your field` then `Begin`, each keep the
 *   visit; said and `Next`, the run ends: `The field is tended`, no counts
 *   line, `Nothing grew this time.` (a second recall of a verse first said
 *   today leaves it a seed), no grown verse and `Your field` the one
 *   control; nothing is written but the recall said.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { launchNeed, needDevice as deviceOf, recordOf as recall } from '../test/need-rig';
import { END } from '../test/root-rule';

const NEED = 'When I need…';

const HOME = 'Your field';

const NOW = Date.UTC(2026, 4, 12, 15);

describe('When I need…', () => {
  it('offers the promises known by situation, and a visit through Today kept over home both ways', async () => {
    const device = deviceOf([
      recall(passage.reference, NOW - 3 * 60_000),
      recall('Psalms 56:3', NOW - 2 * 60_000),
    ]);
    const time = { now: NOW };
    const start = new Map(device.disk);
    const rig = await launchNeed(device, time);
    expect(await rig.until(() => rig.has(NEED))).toBe(true);
    expect({ headings: rig.headings(), first: rig.names()[0] }).toEqual({
      headings: [HOME],
      first: NEED,
    });

    await rig.tap(NEED);
    expect(await rig.until(() => rig.headings().includes(NEED))).toBe(true);
    expect({ headings: rig.headings(), cards: rig.cards() }).toEqual({
      headings: [NEED],
      cards: [
        {
          title: 'Protection & Fear',
          heading: false,
          promises: ['Psalms 56:3'],
          toLearn: ['11 still to learn'],
        },
        { title: 'Strength', heading: false, promises: [passage.reference], toLearn: [] },
      ],
    });

    await rig.tap('Psalms 56:3');
    expect(await rig.until(() => rig.references().join() === 'Psalms 56:3')).toBe(true);
    expect({
      headings: rig.headings(),
      say: rig.has('Say it'),
      listen: rig.has('Listen'),
      need: rig.has(NEED),
      back: rig.has(HOME),
    }).toEqual({ headings: ['Today'], say: true, listen: false, need: false, back: true });

    await rig.tap(HOME);
    expect(await rig.until(() => rig.headings().includes(HOME) && rig.has('Begin'))).toBe(true);
    await rig.tap('Begin');
    expect(await rig.until(() => rig.headings().includes('Today'))).toBe(true);
    expect(rig.references()).toEqual(['Psalms 56:3']);
    await rig.tap(HOME);
    expect(await rig.until(() => rig.has(NEED))).toBe(true);
    await rig.tap(NEED);
    expect(await rig.until(() => rig.headings().includes(NEED))).toBe(true);
    await rig.tap(HOME);
    expect(await rig.until(() => rig.headings().includes(HOME) && rig.has('Begin'))).toBe(true);
    await rig.tap('Begin');
    expect(await rig.until(() => rig.headings().includes('Today'))).toBe(true);
    expect(rig.references()).toEqual(['Psalms 56:3']);

    time.now += 60_000;
    await rig.tap('Say it');
    expect(await rig.until(() => rig.has('Next'))).toBe(true);
    await rig.tap('Next');
    expect(await rig.until(() => !rig.has('Next'))).toBe(true);
    expect(await rig.until(() => rig.headings().includes(END))).toBe(true);
    expect({
      headings: rig.headings(),
      references: rig.references(),
      counts: rig.counts(),
      grew: rig.grew(),
      grown: rig.grown(),
      names: rig.names(),
    }).toEqual({
      headings: [END],
      references: [],
      counts: [],
      grew: ['Nothing grew this time.'],
      grown: [],
      names: [HOME],
    });
    expect({ frames: rig.frames.need > 0, end: rig.frames.end > 0, faults: rig.faults }).toEqual({
      frames: true,
      end: true,
      faults: [],
    });
    await rig.leave();
    const added = [...device.disk.keys()].filter((key) => !start.has(key));
    expect({
      added: added.map((key) => JSON.parse(device.disk.get(key) ?? '{}').reference),
      kept: [...start].every(([key, value]) => device.disk.get(key) === value),
    }).toEqual({ added: ['Psalms 56:3'], kept: true });
  });

  it('shows a fresh reader the taught card still to learn and the first minute’s promise; left out of the layer, no taught card', async () => {
    const entries = [recall(passage.reference, NOW - 10 * 60_000)];
    const cards = async (promises: readonly string[] | null) => {
      const rig = await launchNeed(deviceOf(entries), { now: NOW }, promises);
      expect(await rig.until(() => rig.has(NEED))).toBe(true);
      await rig.tap(NEED);
      expect(await rig.until(() => rig.cards().length > 0)).toBe(true);
      const seen = rig.cards();
      expect(rig.faults).toEqual([]);
      await rig.leave();
      return seen;
    };
    const strength = {
      title: 'Strength',
      heading: false,
      promises: [passage.reference],
      toLearn: [],
    };
    expect(await cards(null)).toEqual([strength]);
    expect(await cards(['protection'])).toEqual([
      { title: 'Protection & Fear', heading: false, promises: [], toLearn: ['12 still to learn'] },
      strength,
    ]);
  });
});
