/**
 * A recital Today says under the cue the garden's stage gives, through the
 * rig (`src/test/today-rig.tsx`), which holds every frame to the rule for
 * each word under the recital's own cue: here the full text before the
 * passage is planted. It catches a recital said under another cue than the
 * screen shows, an unsaid word that shows more or less than that cue while
 * it listens, and a suggestion that ignores the cue. The cue at a seed
 * (first letters) is `cue-say-letters.test.tsx`'s, at a blade (nothing)
 * `today.test.tsx`'s.
 */

import { describe, it } from 'bun:test';

import { NOT_PLANTED, saysUnderCue } from '../test/today-rig';

describe('Today’s recital under its cue', () => {
  it('says it under full at not planted: every unsaid word shows that cue while it listens, and a recital whole is suggested Hard', () =>
    saysUnderCue(NOT_PLANTED, 'full'));
});
