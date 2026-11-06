/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, effect/noTryCatch -- a React screen test: it mounts the root in happy-dom through the wake rig's promise-based steps over a disk (its recalls written as the garden writes them, in JSON) and a clock kept in plain values, the zone put back in a `finally` even when a step throws. */

/**
 * Listen's edges on Today, each a case the walks reach by chance at most: a
 * new piece of 90 words after a review offers Listen only at it, before
 * Say it and outside the scroll view, and two taps in one turn read its own
 * text once; a refused speak leaves Listen and Say it with no alert and
 * nothing written; and Say it while Listen reads stops the voice before the
 * recognizer listens.
 */

import { describe, expect, it } from 'bun:test';
import { MutableRef, Option } from 'effect';
import { act } from 'react';
import passage from 'virtual:heartseed-passage';

import { sourceWords } from '../matcher/words';
import type { Recall } from '../sayit';
import type { TextPiece } from '../session';
import { MINUTES_KEY } from '../session/service';
import { keyOf } from '../test/garden-model';
import { deviceOf, PASSAGE, scrolled, type Faults } from '../test/run-rig';
import { DAY } from '../test/session-model';
import { readingVoice, wakeLaunch, type WakeLaunch } from '../test/wake-rig';
import { hostZone, restore, travel } from '../test/zone';

const T0 = Date.UTC(2027, 0, 14, 13);

/** `work` with the host in UTC, the zone before put back after, even when it throws. */
const inUtc = async (work: () => Promise<void>) => {
  const before = hostZone();
  travel('UTC');
  try {
    await work();
  } finally {
    restore(before);
  }
};

const pieceOf = (reference: string, words: number): TextPiece => {
  const text = Array.from({ length: words }, (_, at) => ['amber', 'brook', 'cedar'][at % 3]).join(
    ' ',
  );
  return { reference, text, words: sourceWords(text).length, group: 'G1' };
};

/** A recall of `reference` a month before the launch, graded Good, so it is due. */
const recordOf = (reference: string, words: number): readonly [string, string] => {
  const recall: Recall = {
    reference,
    startedAt: T0 - 30 * DAY,
    offset: 0,
    grade: 3,
    suggested: 3,
    words,
    missed: 0,
    peeked: 0,
    extra: 0,
  };
  return [keyOf(recall), JSON.stringify(recall)];
};

const faultsOf = (): Faults => ({ unread: false, refuse: false });

/** The node of the button named `label`; the test fails when none shows. */
const button = (app: WakeLaunch, label: string) =>
  Option.getOrThrow(
    Option.fromNullishOr(
      [...app.host.querySelectorAll('[role="button"]')].find(
        (node) => node.getAttribute('aria-label') === label,
      ),
    ),
  );

describe('Listen at Today’s edges', () => {
  it('offers Listen only at a 90-word new piece after a review, before Say it and outside the scroll, and reads its own text once for two taps in one turn', () =>
    inUtc(async () => {
      const fresh = pieceOf('Alder 2:1', 90);
      const device = deviceOf([recordOf(PASSAGE.reference, PASSAGE.words), [MINUTES_KEY, '20']]);
      const voice = readingVoice();
      const app = await wakeLaunch(device, faultsOf(), { now: T0 }, [PASSAGE, fresh], { voice });
      expect(await app.until(() => app.references()[0] === PASSAGE.reference)).toBe(true);
      expect(app.has('Listen')).toBe(false);
      MutableRef.set(app.hearing, { kind: 'heard', text: passage.text, skip: [] });
      await app.tap('Say it');
      expect(await app.until(() => app.has('Listening'))).toBe(true);
      await app.tap('Listening');
      expect(await app.until(() => app.has('Next'))).toBe(true);
      expect(app.has('Listen')).toBe(false);
      await app.tap('Next');
      expect(await app.until(() => app.has('Listen'))).toBe(true);
      expect(app.references()).toEqual([fresh.reference]);
      const listen = button(app, 'Listen');
      const sayIt = button(app, 'Say it');
      expect(listen.compareDocumentPosition(sayIt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect([scrolled(listen), scrolled(sayIt)]).toEqual([false, false]);
      await act(async () => {
        for (const _ of [1, 2])
          listen.dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
          );
      });
      expect(await app.until(() => !app.has('Listen'))).toBe(true);
      expect(voice.spoken.length).toBe(1);
      expect(voice.spoken[0] === fresh.text).toBe(true);
      expect(app.actions()).toEqual(['Say it']);
      await voice.end('finish');
      expect(await app.until(() => app.has('Listen'))).toBe(true);
      expect(voice.spoken.length).toBe(1);
      expect(app.faults).toEqual([]);
      await app.leave();
    }));

  it('leaves Listen and Say it after a refused speak, with no alert and nothing written, and stops the voice before the recognizer listens at Say it', () =>
    inUtc(async () => {
      const fresh = pieceOf('Alder 3:1', 8);
      const device = deviceOf([recordOf('Stray 9:9', 4)]);
      const voice = readingVoice();
      const app = await wakeLaunch(device, faultsOf(), { now: T0 }, [fresh], { voice });
      expect(await app.until(() => app.has('Listen'))).toBe(true);
      voice.state.refuse = true;
      await app.tap('Listen');
      voice.state.refuse = false;
      await app.until(() => false, 5);
      expect([app.has('Listen'), app.actions(), app.alerts()]).toEqual([true, ['Say it'], 0]);
      expect([voice.spoken.length, voice.reading(), device.writes]).toEqual([1, false, []]);
      await app.tap('Listen');
      expect(await app.until(() => !app.has('Listen'))).toBe(true);
      expect(voice.reading()).toBe(true);
      await app.tap('Say it');
      expect(await app.until(() => app.has('Listening'))).toBe(true);
      expect(voice.calls.map((each) => `${each.call}@${each.listens}`)).toEqual([
        'speak@0',
        'speak@0',
        'stop@0',
      ]);
      expect(app.listens.n).toBe(1);
      expect([app.has('Listen'), voice.reading()]).toEqual([false, false]);
      expect(app.faults).toEqual([]);
      await app.leave();
    }));
});
