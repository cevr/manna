/* oxlint-disable effect/noAsyncFunction, effect/noNullish -- a React screen test: it drives Today through the rig's promise-based `act` turns, and reads nodes whose absent matches are null. */

/**
 * Today's cue through a held launch, through the rig
 * (`src/test/today-rig.tsx`): while the garden's read is held, every
 * pending frame shows no word of the verse, seen or named, in the
 * whole-text node or a word node, and no run of it anywhere; once the read
 * lands, a read garden's launch is taken from home to Today by `Begin`,
 * an unread one opens Today, and the passage shows its cue. The cue at
 * rest and after an unheard recital is `cue.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { recite, scriptedSource } from '../dictation/script';
import { BLADE, heldDisk, mount, NOT_PLANTED, passageAt, SEED } from '../test/today-rig';

describe('Today’s cue through a held launch', () => {
  for (const [stage, disk, cue] of [
    ['not planted', NOT_PLANTED, 'full'],
    ['a seed', SEED, 'initials'],
    ['a blade', BLADE, 'none'],
    ['unread', { recalls: passageAt(1), unread: true }, 'full'],
  ] as const)
    it(`shows no word of the verse, seen or named, in the whole-text node or a word node, and no run of it anywhere, in every pending frame of a held launch (${stage}), then its cue (${cue}) once the read lands`, async () => {
      const held = heldDisk(disk);
      const today = await mount(scriptedSource(recite(passage.text, {})), held.disk, { cue });
      const pending: (readonly number[])[] = [];
      expect(
        await today.until(() => {
          pending.push([today.verseShown(), today.runsElsewhere(), today.button().length]);
          return pending.length >= 4 && today.one('[data-testid="reference"]') !== null;
        }),
      ).toBe(true);
      expect(pending.filter((each) => each.some((n) => n !== 0))).toEqual([]);
      held.release();
      if (!disk.unread) await today.begin();
      expect(await today.until(() => today.label() === 'Say it')).toBe(true);
      expect([today.verseShown() > 0, today.runsElsewhere()]).toEqual([cue !== 'none', 0]);
      await today.leave();
    });
});
