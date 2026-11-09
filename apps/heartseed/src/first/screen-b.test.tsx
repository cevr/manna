/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noNewPromise -- a React screen test: it drives the root route in happy-dom's document through the launch's promise-based `act`, each turn handed over until the frame the test waits on lands, at most 3 s; it reads nodes whose absent attributes are null, and the kept record as JSON text. */

/**
 * The first minute as a reader meets it, through `screenLaunch`: the root
 * route mounted in happy-dom under the app's own layer over the real store
 * on the device's `One.Database`, the scripted recital (the passage less its
 * 11th word) and a voice source that records its calls and sends the events
 * the test gives it. Every frame (each DOM mutation batch) is read: a frame
 * before the garden's read shows no heading and no button, no first-minute
 * frame names a stage outside Planted, and every frame holds the root's
 * frame rule (`rootFaults`). Continue, and a later launch with a plant, show
 * home; `Begin` there opens Today. The voice off offers no Listen; Next
 * stops a reading; a relaunch mid-flow keeps nothing; an unread garden opens
 * Today; a held launch shows nothing until its read. It counts words without
 * printing one.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { toDue, type Time } from '../test/clock';
import { recallKeys, screenLaunch as mount, SWITCH } from '../test/first-rig';
import { device } from '../test/one';
import { sourceWords } from '../matcher/words';
import { wordSpans } from '../voice/reading';

const WORDS = sourceWords(passage.text);
const SPANS = wordSpans(passage.text);

describe('the first minute', () => {
  it('on a fresh install: hears the verse lit word by word, says it with first letters keeping nothing, says it alone and plants one seed, then Continue opens home in its done state, and the next launch at the seed’s due opens home, whose Begin opens Today at a seed', async () => {
    device.launch([]);
    const first = await mount();
    expect(await first.until(() => first.heading() === 'Hear it')).toBe(true);
    expect([first.buttons(), first.voice.calls.speaks]).toEqual([['Listen', 'Next'], 0]);
    expect(WORDS.every((text, index) => first.word(index)?.textContent === text)).toBe(true);
    await first.click('Listen');
    expect(await first.until(() => first.voice.calls.speaks === 1 && first.inked() === 0)).toBe(
      true,
    );
    expect(first.buttons()).toEqual(['Next']);
    await first.send({ kind: 'range', location: SPANS[0]?.start ?? 0, length: 1 });
    await first.send({
      kind: 'range',
      location: SPANS[1]?.start ?? 0,
      length: (SPANS[2]?.end ?? 0) - (SPANS[1]?.start ?? 0),
    });
    expect(await first.until(() => first.inked() === 3)).toBe(true);
    expect(first.selected()).toEqual([1, 2]);
    await first.send({ kind: 'finish', location: 0, length: 0 });
    expect(await first.until(() => first.heading() === 'Say it with help')).toBe(true);
    expect(
      WORDS.every(
        (text, index) =>
          first.word(index)?.getAttribute('aria-label') ===
          [...text].find((char) => /[\p{L}\p{N}]/u.test(char)),
      ),
    ).toBe(true);
    await first.click('Say it');
    expect(await first.until(() => first.heading() === 'Say it alone')).toBe(true);
    expect([recallKeys(), device.calls.set]).toEqual([[], 0]);
    expect(
      WORDS.every((_, index) => first.word(index)?.getAttribute('aria-hidden') === 'true'),
    ).toBe(true);
    await first.click('Say it');
    expect(await first.until(() => first.heading() === 'Planted')).toBe(true);
    expect([first.stage(), recallKeys().length, first.chimes]).toEqual(['Stage: seed', 1, []]);
    const kept = JSON.parse(device.disk.get(recallKeys()[0] ?? '') ?? 'null');
    expect([kept.grade, kept.suggested, kept.words, kept.missed]).toEqual([2, 2, WORDS.length, 1]);
    await first.click('Continue');
    expect(
      await first.until(() => first.heading() === 'Your field' && first.home().counts !== ''),
    ).toBe(true);
    await first.until(() => first.heading() !== 'Your field', 20);
    expect([first.heading(), first.home(), first.stage(), first.actions()]).toEqual([
      'Your field',
      { counts: 'Nothing to tend now', begin: false },
      null,
      [],
    ]);
    expect(first.host.querySelector('[data-testid="growth"]')).toBe(null);
    expect(first.frames).toMatchObject({ pendingOffers: 0, claims: 0, many: 0 });
    await first.leave();

    const time: Time = { now: null };
    toDue(time, [kept]);
    device.launch();
    const next = await mount(undefined, undefined, time);
    expect(await next.until(() => next.home().begin)).toBe(true);
    expect(next.heading()).toBe('Your field');
    await next.click('Begin');
    expect(await next.until(() => next.stage() !== null)).toBe(true);
    expect([next.heading(), next.stage(), next.frames.claims, recallKeys().length]).toEqual([
      'Today',
      'Stage: seed',
      0,
      1,
    ]);
    expect(next.actions()).toEqual(['Say it']);
    await next.leave();
  });

  it('with the voice off: offers no Listen and never speaks, and Next goes on', async () => {
    device.launch([[SWITCH, 'false']]);
    const first = await mount();
    expect(await first.until(() => first.heading() === 'Hear it')).toBe(true);
    expect(first.buttons()).toEqual(['Next']);
    await first.click('Next');
    expect(await first.until(() => first.heading() === 'Say it with help')).toBe(true);
    expect([first.voice.calls.speaks, device.disk.get(SWITCH)]).toEqual([0, 'false']);
    await first.leave();
  });

  it('stops a reading under way at Next, and keeps nothing at a relaunch mid-flow, which starts again at hear', async () => {
    device.launch([]);
    const first = await mount();
    expect(await first.until(() => first.heading() === 'Hear it')).toBe(true);
    await first.click('Listen');
    await first.click('Next');
    expect(await first.until(() => first.heading() === 'Say it with help')).toBe(true);
    expect(first.voice.calls.stops).toBe(1);
    await first.click('Say it');
    expect(await first.until(() => first.heading() === 'Say it alone')).toBe(true);
    await first.leave();
    device.launch();
    const again = await mount();
    expect(await again.until(() => again.heading() === 'Hear it')).toBe(true);
    expect(recallKeys()).toEqual([]);
    await again.leave();
  });

  it('never opens on a garden it could not read: Today, claiming no stage', async () => {
    device.launch([]).fail('keys', 3);
    const today = await mount(undefined, undefined, undefined, 'unread');
    expect(await today.until(() => today.heading() !== null && device.calls.keys === 3)).toBe(true);
    await today.until(() => false, 20);
    expect([today.heading(), today.stage(), today.frames.claims]).toEqual(['Today', null, 0]);
    await today.leave();
  });

  it('shows a held launch no heading and no button, and lists nothing, until its read completes, then the first minute', async () => {
    device.launch([]);
    const gate = Promise.withResolvers<void>();
    const first = await mount(gate.promise);
    await first.until(() => false, 20);
    expect([first.heading(), first.buttons(), device.calls.keys, first.frames.pending > 0]).toEqual(
      [null, [], 0, true],
    );
    expect(first.host.querySelector('[data-testid="reference"]')?.textContent).toBe(
      passage.reference,
    );
    gate.resolve();
    expect(await first.until(() => first.heading() === 'Hear it')).toBe(true);
    expect(first.frames).toMatchObject({ pendingOffers: 0, many: 0 });
    await first.leave();
  });
});
