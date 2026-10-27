import { Effect } from 'effect';
import { expect, it } from 'bun:test';

import { WebsterService } from './service.js';

it('keeps exact entries and duplicate source order ahead of dictionary-backed KJV candidates', () => {
  const entries = [
    { id: 3, headword: 'dismayed', definition: 'Disheartened; deprived of courage.' },
    { id: 2, headword: 'love', definition: 'To regard with affection.' },
    { id: 1, headword: 'love', definition: 'Affection.' },
    { id: 4, headword: 'dismay', definition: 'To terrify.' },
    { id: 5, headword: 'abide', definition: 'To remain.' },
    { id: 6, headword: 'sit', definition: 'To rest.' },
    { id: 7, headword: 'sitte', definition: 'Retained e candidate.' },
    { id: 8, headword: 'sitt', definition: 'Bare candidate.' },
  ];
  const lookup = (query: string) =>
    Effect.runSync(
      WebsterService.use((service) => service.lookup(query)).pipe(
        Effect.provide(WebsterService.Test({ entries })),
      ),
    );
  expect(lookup('  DISMAYED ').entries.map((entry) => entry.id)).toEqual([3]);
  expect(lookup('loveth').entries.map((entry) => entry.id)).toEqual([1, 2]);
  expect(lookup('abideth').entries.map((entry) => entry.id)).toEqual([5]);
  expect(lookup('sitteth').entries.map((entry) => entry.id)).toEqual([6]);
  for (const query of ['unknowneth', '', '   ', 'eth', 'shew'])
    expect(lookup(query).entries).toEqual([]);
  expect(lookup('abideth').match).toBe('kjv-inflection');
  expect(lookup('dismayed').match).toBe('exact');
});

it('tries a bare generic stem before an undoubled stem when retained e is absent', () => {
  const layer = WebsterService.Test({
    entries: [
      { id: 1, headword: 'begg', definition: 'Bare synthetic stem.' },
      { id: 2, headword: 'beg', definition: 'Undoubled synthetic stem.' },
    ],
  });
  const result = Effect.runSync(
    WebsterService.use((service) => service.lookup('beggeth')).pipe(Effect.provide(layer)),
  );
  expect(result.entries.map((entry) => entry.headword)).toEqual(['begg']);
  expect(result.match).toBe('kjv-inflection');
});

it('uses retained e before bare and undoubled generic collisions without an alias', () => {
  const layer = WebsterService.Test({
    entries: ['xqsitte', 'xqsitt', 'xqsit'].map((headword, index) => ({
      id: index + 1,
      headword,
      definition: 'Synthetic collision.',
    })),
  });
  for (const query of ['xqsitteth', 'xqsittest']) {
    const result = Effect.runSync(
      WebsterService.use((service) => service.lookup(query)).pipe(Effect.provide(layer)),
    );
    expect(result.entries.map((entry) => entry.headword)).toEqual(['xqsitte']);
    expect(result.match).toBe('kjv-inflection');
  }
});

it('distinguishes the exact NONE headword, no-entry aliases and missing alias targets', () => {
  const layer = WebsterService.Test({
    entries: ['none', 'closest', 'clos', 'doe', 'proceede', 'loathe', 'sow'].map(
      (headword, index) => ({
        id: index + 1,
        headword,
        definition: 'Synthetic collision.',
      }),
    ),
  });
  const lookup = (query: string) =>
    Effect.runSync(
      WebsterService.use((service) => service.lookup(query)).pipe(Effect.provide(layer)),
    );
  expect(lookup('none')).toMatchObject({ match: 'exact', key: 'none' });
  expect(lookup('none').entries.map((entry) => entry.headword)).toEqual(['none']);
  for (const query of ['soweth', 'proceedeth', 'loatheth', 'doeth', 'closest']) {
    expect(lookup(query).entries).toEqual([]);
    expect(lookup(query).match).toBe('none');
  }
});
