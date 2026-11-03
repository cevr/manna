/** §10 Milestone 8: "router classifies quoted / refcode / wordy inputs
 *  correctly". */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { countWords, parseRefcode, route, WORDY_WORD_THRESHOLD } from './router.js';

describe('§9.3 the query router', () => {
  describe('quoted string → exact phrase, lexical only', () => {
    it('routes a straight-quoted string to the phrase route', () => {
      const routed = route('"the daily"');
      expect(routed._tag).toBe('phrase');
      if (routed._tag !== 'phrase') return;
      expect(routed.phrase).toBe('the daily');
    });

    it('routes typographic quotes the same way', () => {
      const routed = route('“the daily”');
      expect(routed._tag).toBe('phrase');
      if (routed._tag !== 'phrase') return;
      expect(routed.phrase).toBe('the daily');
    });

    it('a quoted refcode is a phrase, not a locate-jump', () => {
      const routed = route('"GC 425"');
      expect(routed._tag).toBe('phrase');
    });

    it('refuses an empty or unbalanced quote', () => {
      expect(route('""')._tag).toBe('hybrid');
      expect(route('"the daily')._tag).toBe('hybrid');
    });

    it('a quote inside a question is a wordy hybrid query, not a phrase', () => {
      const routed = route('why "the daily" matters');
      expect(routed._tag).toBe('hybrid');
      if (routed._tag !== 'hybrid') return;
      expect(routed.wordy).toBe(true);
      expect(routed.text).toBe('why "the daily" matters');
    });
  });

  describe('refcode pattern → locate-jump', () => {
    it('routes a book code plus a page number', () => {
      const routed = route('GC 425');
      expect(routed._tag).toBe('locate');
      if (routed._tag !== 'locate') return;
      expect(routed.refcode).toBe('GC 425');
    });

    it('routes a book code plus page and paragraph', () => {
      const routed = route('1SM 12.3');
      expect(routed._tag).toBe('locate');
      if (routed._tag !== 'locate') return;
      expect(routed.refcode).toBe('1SM 12.3');
    });

    it('normalizes the code to upper case', () => {
      expect(parseRefcode('gc 425')).toEqual(Option.some('GC 425'));
    });

    it('a bare book code is not a location', () => {
      expect(route('GC')._tag).toBe('hybrid');
      expect(route('DA')._tag).toBe('hybrid');
    });

    it('a bare number pair is not a refcode', () => {
      expect(parseRefcode('1 2')).toEqual(Option.none());
    });

    it('a refcode with trailing words is a description, not a reference', () => {
      expect(route('GC 425 and the loud cry')._tag).toBe('hybrid');
    });
  });

  describe('everything else → hybrid, wordy above the threshold', () => {
    it('a one-word query is not wordy', () => {
      const routed = route('sanctuary');
      expect(routed._tag).toBe('hybrid');
      if (routed._tag !== 'hybrid') return;
      expect(routed.words).toBe(1);
      expect(routed.wordy).toBe(false);
    });

    it('a two-word query is not wordy', () => {
      const routed = route('latter rain');
      expect(routed._tag).toBe('hybrid');
      if (routed._tag !== 'hybrid') return;
      expect(routed.wordy).toBe(false);
    });

    it('the threshold is inclusive at three words', () => {
      const routed = route('close of probation');
      expect(routed._tag).toBe('hybrid');
      if (routed._tag !== 'hybrid') return;
      expect(routed.words).toBe(WORDY_WORD_THRESHOLD);
      expect(routed.wordy).toBe(true);
    });

    it('a described question is wordy', () => {
      const routed = route('what happens at the close of probation');
      expect(routed._tag).toBe('hybrid');
      if (routed._tag !== 'hybrid') return;
      expect(routed.wordy).toBe(true);
    });

    it('counts runs of non-whitespace, and collapses surrounding space', () => {
      expect(countWords('  close   of  probation  ')).toBe(3);
      const routed = route('  close   of  probation  ');
      if (routed._tag !== 'hybrid') return;
      expect(routed.text).toBe('close   of  probation');
    });
  });
});
