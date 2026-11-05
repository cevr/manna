/* oxlint-disable effect/noAsyncFunction, effect/noTernary, effect/noNullish -- a React screen test: it drives Today through the rig's promise-based `act` turns, picks each stage's expected tree in one line, and reads nodes whose absent matches are null. */

/**
 * Today's cue as the garden's stage gives it, through the rig
 * (`src/test/today-rig.tsx`), which holds every frame to the rule for each
 * word under the cue it shows: the full text before the passage is
 * planted, its first letters at a seed, nothing at a blade; a recital said
 * under that cue, a recital not heard, and an unread garden (whole, said
 * with nothing). It catches a word that shows more than its cue (letters
 * whole, the verse whole after an unheard recital, the verse in the pending
 * frame of a held launch), a recital said under
 * another cue than the screen shows, and a run of the verse outside the
 * word nodes. It misses the stage rule itself (`src/ladder.property.test.ts`).
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import passage from 'virtual:heartseed-passage';

import { recite, scriptedSource } from '../dictation/script';
import {
  BLADE,
  failing,
  heldDisk,
  mount,
  NOT_PLANTED,
  passageAt,
  SEED,
  WORDS,
} from '../test/today-rig';

/** Each stage the passage can be read at on the disk, and the cue Today shows it under. */
const LADDER = [
  ['not planted', NOT_PLANTED, 'full'],
  ['a seed', SEED, 'initials'],
  ['a blade', BLADE, 'none'],
] as const;

describe('Today’s cue, by the stage the garden reads', () => {
  for (const [stage, disk, cue] of LADDER)
    it(`shows the passage at rest as ${stage} shows it (${cue}), each word seen and named as the cue says, and no run of the verse anywhere else`, async () => {
      const n = WORDS.length;
      const today = await mount(scriptedSource(recite(passage.text, {})), disk, { cue });
      expect(await today.until(() => today.label() === 'Say it')).toBe(true);
      expect(await today.until(() => (today.unsaid.get(cue) ?? 0) >= n || cue === 'full')).toBe(
        true,
      );
      expect([
        today.one('[data-testid="passage"]')?.textContent === passage.text,
        today.all('[data-testid^="word-"]').length,
        today.runsElsewhere(),
      ]).toEqual(cue === 'full' ? [true, 0, 0] : [false, n, 0]);
      await today.leave();
    });

  for (const [stage, disk, cue] of LADDER.slice(1))
    it(`ends a recital that could not be heard at ${stage} with one alert and the verse only as its cue (${cue}), never whole`, async () => {
      const today = await mount(failing('denied'), disk, { cue });
      expect(await today.until(() => today.label() === 'Say it')).toBe(true);
      await today.click(today.button()[0]);
      expect(await today.until(() => today.all('[role="alert"]').length === 1)).toBe(true);
      today.frame();
      expect([
        today.one('[data-testid="passage"]'),
        today.all('[data-testid^="word-"]').length,
        today.runsElsewhere(),
        today.kept,
      ]).toEqual([null, WORDS.length, 0, []]);
      await today.leave();
    });

  it('shows no word and no run of the verse in the pending frame of a held launch, then the letters of a seed once the read lands', async () => {
    const held = heldDisk(SEED);
    const today = await mount(scriptedSource(recite(passage.text, {})), held.disk, {
      cue: 'initials',
    });
    expect(await today.until(() => today.one('[data-testid="reference"]') !== null)).toBe(true);
    expect([
      today.one('[data-testid="passage"]'),
      today.all('[data-testid^="word-"]').length,
      today.runsElsewhere(),
      today.button().length,
    ]).toEqual([null, 0, 0, 0]);
    held.release();
    expect(await today.until(() => (today.unsaid.get('initials') ?? 0) >= WORDS.length)).toBe(true);
    expect([today.one('[data-testid="passage"]'), today.runsElsewhere()]).toEqual([null, 0]);
    await today.leave();
  });

  it('shows the verse whole in an unread garden and says it with nothing: a recital whole is suggested Good and written, with no stage', async () => {
    const today = await mount(
      scriptedSource(recite(passage.text, { every: 5, pace: 1 })),
      { recalls: passageAt(1), unread: true },
      { cue: 'full' },
    );
    expect(await today.until(() => today.label() === 'Say it')).toBe(true);
    expect(today.one('[data-testid="passage"]')?.textContent).toBe(passage.text);
    await today.click(today.button()[0]);
    expect(await today.until(() => today.one('[data-testid="summary"]') !== null)).toBe(true);
    expect([
      today.recitalCue(),
      today.host.textContent?.includes('Suggested: Good'),
      today.one('[data-testid="stage"]'),
      today.kept.map((recall) => recall.grade),
    ]).toEqual([Option.some('none'), true, null, [3]]);
    await today.leave();
  });
});
