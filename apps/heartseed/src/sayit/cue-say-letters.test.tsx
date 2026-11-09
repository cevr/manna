/**
 * A recital Today says under the cue the garden's stage gives, through the
 * rig (`src/test/today-rig.tsx`), which holds every frame to the rule for
 * each word under the recital's own cue: here first letters, at a seed. It
 * catches a recital said under another cue than the screen shows, an
 * unsaid word that shows more or less than that cue while it listens, and
 * a suggestion that ignores the cue. The full text before planting is
 * `cue-say.test.tsx`'s.
 */

import { describe, it } from 'bun:test';

import { saysUnderCue, SEED } from '../test/today-rig';

describe('Today’s recital under its cue', () => {
  it('says it under initials at a seed: every unsaid word shows that cue while it listens, and a recital whole is suggested Hard', () =>
    saysUnderCue(SEED, 'initials'));
});
