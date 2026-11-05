/* oxlint-disable effect/noTernary, effect/noNullish, effect/noGlobals -- the test generates its histories from plain branches, gives the views' absent start and ending as null, and names each failing history as JSON text. */

/**
 * The first minute's flow against its model (`src/test/first-model.ts`,
 * written from the hsfirst spec): seeded histories of the reader's taps,
 * the voice's readings and endings, Say it's recitals (pressed, heard or
 * not) and the garden's plant, from a Say it that shows nothing or a
 * recital from before the flow. After each event the flow's phase, and in
 * letters and alone (the phases that show a recital) whether the screen
 * shows Say it's latest recital as the phase's own, must agree with the
 * model's.
 */

import { describe, expect, it } from 'bun:test';

import { FirstModel, type ModelEnding, type WorldEvent } from '../test/first-model';
import { begin, isOwn, observe, step, type Flow } from './flow';

const random = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const ENDINGS: readonly ModelEnding[] = ['finished', 'stopped', 'off', 'interrupted', 'failed'];

const eventOf = (next: () => number): WorldEvent => {
  const r = next();
  if (r < 0.12) return { t: 'next' };
  if (r < 0.27) return { t: 'read' };
  if (r < 0.42)
    return { t: 'voiceEnd', ending: ENDINGS[Math.floor(next() * ENDINGS.length)] ?? 'finished' };
  if (r < 0.65) return { t: 'press' };
  if (r < 0.92) return { t: 'end', finished: next() < 0.6 };
  return { t: 'plant' };
};

/** The flow after the screen meets `event`: a tap of Next is the flow's own input, the rest it sees in the world's views. */
const play = (flow: Flow, event: WorldEvent, model: FirstModel): Flow => {
  const tapped = event.t === 'next' ? step(flow, { _tag: 'Next' }) : flow;
  return observe(tapped, model.world);
};

describe('the first minute’s flow', () => {
  it('agrees with its model on 3,000 seeded histories of 40 events, phase and own recital alike', () => {
    const reached = new Map<string, number>();
    for (let seed = 1; seed <= 3000; seed++) {
      const next = random(seed);
      const prior = next() < 0.3;
      const model = new FirstModel({
        startedAt: prior ? 7 : null,
        finished: prior && next() < 0.5,
      });
      let flow = observe(begin(model.world.startedAt), model.world);
      const trail = [`seed ${seed} prior ${prior}`];
      for (let k = 0; k < 40; k++) {
        const event = eventOf(next);
        if (!model.offers(event)) continue;
        trail.push(JSON.stringify(event));
        model.apply(event);
        flow = play(flow, event, model);
        const where = trail.join(' ');
        expect(flow.phase, where).toBe(model.phase);
        if (flow.phase === 'letters' || flow.phase === 'alone')
          expect(isOwn(flow, model.world.startedAt), where).toBe(model.own());
        reached.set(flow.phase, (reached.get(flow.phase) ?? 0) + 1);
        if (event.t === 'press')
          reached.set(`press@${flow.phase}`, (reached.get(`press@${flow.phase}`) ?? 0) + 1);
      }
    }
    for (const key of ['hear', 'letters', 'alone', 'planted', 'press@letters', 'press@alone'])
      expect(reached.get(key) ?? 0, key).toBeGreaterThan(500);
  });

  it('goes from hear to letters to alone to Planted on the passage’s first-minute journey, and never back', () => {
    const at = (flow: Flow, seen: Partial<Parameters<typeof observe>[1]>) =>
      observe(flow, {
        voiceEnded: null,
        startedAt: null,
        finished: false,
        planted: false,
        ...seen,
      });
    let flow = at(begin(null), {});
    expect(flow.phase).toBe('hear');
    flow = at(flow, { voiceEnded: 'interrupted' });
    expect(flow.phase).toBe('hear');
    flow = at(flow, { voiceEnded: 'finished' });
    expect(flow.phase).toBe('letters');
    flow = at(flow, { voiceEnded: 'finished', startedAt: 10, finished: false });
    expect([flow.phase, isOwn(flow, 10)]).toEqual(['letters', true]);
    flow = at(flow, { startedAt: 10, finished: true });
    expect([flow.phase, isOwn(flow, 10)]).toEqual(['alone', false]);
    flow = at(flow, { startedAt: 20, finished: true });
    expect([flow.phase, isOwn(flow, 20)]).toEqual(['alone', true]);
    flow = at(flow, { startedAt: 20, finished: true, planted: true });
    expect(flow.phase).toBe('planted');
    expect(step(flow, { _tag: 'Next' }).phase).toBe('planted');
    expect(at(flow, { voiceEnded: 'finished', startedAt: 30, finished: true }).phase).toBe(
      'planted',
    );
  });
});
