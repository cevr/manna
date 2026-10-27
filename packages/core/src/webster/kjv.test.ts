import { Effect } from 'effect';
import { expect, it } from 'bun:test';

import domain from './fixtures/kjv-endings.json';
import lexicon from './fixtures/kjv-lexicon.json';
import { WebsterService } from './service.js';

const layer = WebsterService.Test({
  entries: lexicon.keys.map((headword, index) => ({
    id: index + 1,
    headword,
    definition: 'Pinned dictionary headword existence fixture.',
  })),
});
const lookup = (query: string) =>
  Effect.runSync(
    WebsterService.use((service) => service.lookup(query)).pipe(Effect.provide(layer)),
  );

for (const [form, expected] of [
  ['doeth', 'do'],
  ['doest', 'do'],
  ['sayest', 'say'],
] as const)
  it(`resolves KJV ${form} to its verb instead of a colliding noun`, () => {
    expect(lookup(form).entries.map((entry) => entry.headword)).toEqual([expected]);
  });

for (const form of ['soweth', 'sowest', 'swalloweth', 'tilleth', 'tillest', 'leaveth', 'leftest'])
  it(`returns no entry for KJV ${form} when the source has only an unrelated noun homograph`, () => {
    expect(lookup(form).entries).toEqual([]);
    expect(lookup(form).match).toBe('none');
  });

for (const form of ['proceedeth', 'loatheth'])
  it(`returns no entry for KJV ${form} when its source record is unsafe`, () => {
    expect(lookup(form).entries).toEqual([]);
    expect(lookup(form).match).toBe('none');
  });

it('resolves closest to the audited KJV verb close ahead of the exact adjective', () => {
  expect(lookup('closest')).toMatchObject({ match: 'kjv-alias', key: 'close' });
  expect(lookup('closest').entries.map((entry) => entry.headword)).toEqual(['close']);
});

it('preserves exact grammar entries ahead of irregular aliases', () => {
  for (const form of ['art', 'dost', 'hast', 'wast']) {
    expect(lookup(form).match).toBe('exact');
    expect(lookup(form).entries.map((entry) => entry.headword)).toEqual([form]);
  }
});

it('resolves every audited KJV form to its reviewed entry or none with real collision vocabulary', () => {
  const failures = Effect.runSync(
    WebsterService.use((service) =>
      Effect.gen(function* () {
        const mismatches: string[] = [];
        for (const row of domain.forms) {
          const result = yield* service.lookup(row.form);
          const expected = [];
          if (row.lemma !== 'none') expected.push(row.lemma);
          if (result.entries.map((entry) => entry.headword).join(',') !== expected.join(','))
            mismatches.push(
              `${row.form}: expected ${row.lemma}; got ${result.entries.map((entry) => entry.headword).join(',')}`,
            );
        }
        return mismatches;
      }),
    ).pipe(Effect.provide(layer)),
  );
  expect(failures).toEqual([]);
});

it('stops an audited alias when its lemma is missing instead of trying a colliding stem', () => {
  const onlyNouns = WebsterService.Test({
    entries: [
      { id: 1, headword: 'doe', definition: 'A she deer.' },
      { id: 2, headword: 'saye', definition: 'A serge.' },
      { id: 3, headword: 'e', definition: 'A letter.' },
    ],
  });
  const results = Effect.runSync(
    WebsterService.use((service) =>
      Effect.forEach(['doeth', 'doest', 'sayest', 'eth', 'est'], (query) => service.lookup(query)),
    ).pipe(Effect.provide(onlyNouns)),
  );
  expect(results.every((result) => result.entries.length === 0)).toBe(true);
});

it('uses verified irregular lemmas when exact grammar entries are absent', () => {
  const layer = WebsterService.Test({
    entries: ['be', 'do', 'have', 'say', 'am'].map((headword, index) => ({
      id: index + 1,
      headword,
      definition: 'Synthetic existence fixture.',
    })),
  });
  const results = Effect.runSync(
    WebsterService.use((service) =>
      Effect.forEach(['art', 'wast', 'dost', 'doth', 'hast', 'hath', 'saith'], (query) =>
        service.lookup(query),
      ),
    ).pipe(Effect.provide(layer)),
  );
  expect(results.map((result) => result.entries[0]?.headword)).toEqual([
    'be',
    'be',
    'do',
    'do',
    'have',
    'have',
    'say',
  ]);
});
