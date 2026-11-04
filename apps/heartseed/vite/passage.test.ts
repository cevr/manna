/**
 * The passage derivation: a query names one verse through the corpus's own
 * parser, the canon names its reference, and a query that names no single
 * verse of the KJV fails the build.
 */

import { describe, expect, it } from 'bun:test';

import { passageOf } from './passage';

describe('passageOf', () => {
  it('names the verse as the canon does, whatever the query’s spelling', () => {
    expect(passageOf('isa 41:10').reference).toBe('Isaiah 41:10');
    expect(passageOf('John 11:35')).toEqual({ reference: 'John 11:35', text: 'Jesus wept.' });
  });

  it('fails for a query that names no single verse', () => {
    expect(() => passageOf('John 3')).toThrow('heartseed: John 3 names no single verse');
    expect(() => passageOf('faith hope love')).toThrow('names no single verse');
  });

  it('fails for a verse the KJV does not have', () => {
    expect(() => passageOf('Jude 1:26')).toThrow('heartseed: Jude 1:26 is not in the KJV');
  });
});
