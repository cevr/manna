/* oxlint-disable effect/noAsyncFunction, effect/noNullish -- a React screen test: it drives Today through the rig's promise-based `act` turns, and reads nodes whose absent matches are null. */

/**
 * A recital Today says under the cue the garden's stage gives, through the
 * rig (`src/test/today-rig.tsx`), which holds every frame to the rule for
 * each word under the recital's own cue: the full text before the passage
 * is planted, first letters at a seed. It catches a recital said under
 * another cue than the screen shows, an unsaid word that shows more or less
 * than that cue while it listens, and a suggestion that ignores the cue.
 * The cue at a blade (nothing) is `today.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import passage from 'virtual:heartseed-passage';

import { recite, scriptedSource } from '../dictation/script';
import { mount, NOT_PLANTED, SEED, WORDS } from '../test/today-rig';

describe('Today’s recital under its cue', () => {
  for (const [stage, disk, cue] of [
    ['not planted', NOT_PLANTED, 'full'],
    ['a seed', SEED, 'initials'],
  ] as const)
    it(`says it under ${cue} at ${stage}: every unsaid word shows that cue while it listens, and a recital whole is suggested Hard`, async () => {
      const n = WORDS.length;
      const today = await mount(scriptedSource(recite(passage.text, { every: 5, pace: 4 })), disk, {
        cue,
      });
      expect(await today.until(() => today.label() === 'Say it')).toBe(true);
      const atRest = today.unsaid.get(cue) ?? 0;
      await today.click(today.button()[0]);
      expect(await today.until(() => today.label() === 'Listening')).toBe(true);
      expect(today.recitalCue()).toEqual(Option.some(cue));
      expect(await today.until(() => today.one('[data-testid="summary"]') !== null)).toBe(true);
      expect((today.unsaid.get(cue) ?? 0) - atRest).toBeGreaterThan(n - 5);
      expect([today.host.textContent?.includes('Suggested: Hard'), today.runsElsewhere()]).toEqual([
        true,
        0,
      ]);
      expect(today.kept.map((recall) => [recall.grade, recall.missed])).toEqual([[2, 0]]);
      await today.leave();
    });
});
