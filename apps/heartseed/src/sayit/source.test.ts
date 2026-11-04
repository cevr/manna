/**
 * The source rule: a release build never hears the scripted recital, and a
 * development build hears it only on the simulator, where nothing can
 * listen.
 */

import { describe, expect, it } from 'bun:test';

import { recite } from '../dictation/script';
import { sourceWords } from '../matcher/words';
import { SIMULATOR_PLAN, sourceKind } from './source';

describe('the source Say it hears', () => {
  it('is the replay only in a development build on the simulator, over all four builds', () => {
    expect([
      sourceKind({ dev: false, simulator: false }),
      sourceKind({ dev: false, simulator: true }),
      sourceKind({ dev: true, simulator: false }),
      sourceKind({ dev: true, simulator: true }),
    ]).toEqual(['microphone', 'microphone', 'microphone', 'replay']);
  });

  it('plays the probe’s recital on the simulator: every word but the 11th, finalized every 5, 150 ms a word', () => {
    expect(SIMULATOR_PLAN).toEqual({ skip: [10], every: 5, pace: 150 });
    const verse = Array.from({ length: 12 }, (_, index) => `w${index}`).join(' ');
    const said = recite(verse, SIMULATOR_PLAN)
      .filter((step) => step.final)
      .flatMap((step) => step.runs.map((run) => run.text));
    expect(said).toEqual(sourceWords(verse).filter((_, index) => index !== 10));
  });
});
