import { BunServices } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
import { Effect, FileSystem, Layer, Schema } from 'effect';
import { expect, it } from 'effect-bun-test';

import domain from './fixtures/kjv-endings.json';
import lexicon from './fixtures/kjv-lexicon.json';
import { hasOwnVerbMarker } from './fixtures/verb-source.js';
import { WebsterService } from './service.js';
import { layerWebsterBun } from './service-bun.js';

const filename = new URL('../../data/webster.db', import.meta.url).pathname;

it.scoped('keeps the independently reviewed lexical judgments for the complete KJV domain', () =>
  Effect.gen(function* () {
    // The independent reviewed-domain digest prevents a matching wrong fixture
    // edit from excusing a wrong production lemma.
    const judgments = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(
      domain.forms,
    );
    expect(new Bun.CryptoHasher('sha256').update(judgments).digest('hex')).toBe(
      '010f43f619980acd4d4df9ec965ecb3e1fb40b9aea761d6f83f381a6086aa387',
    );
  }),
);
it.scoped(
  'every KJV verb and exact inflection resolves to its own source-marked verb or no entry with no unused exceptions',
  () =>
    WebsterService.use((service) =>
      Effect.gen(function* () {
        const db = yield* Effect.acquireRelease(
          Effect.sync(() => new Database(filename, { readonly: true, create: false })),
          (opened) => Effect.sync(() => opened.close()),
        );
        const source = db.query<{ source_html: string }, [number]>(
          'SELECT source_html FROM entries WHERE id = ?',
        );
        const exceptions = new Set(Object.keys(domain.verbSourceExceptions));
        const used = new Set<string>();
        const failures: string[] = [];
        let verbRows = 0;
        let exactInflections = 0;
        expect(domain.forms).toHaveLength(970);
        for (const row of domain.forms) {
          if (row.kind !== 'verb' && row.kind !== 'exact-inflection') continue;
          verbRows++;
          if (row.kind === 'exact-inflection') exactInflections++;
          const result = yield* service.lookup(row.form);
          if (row.kind === 'exact-inflection') expect(result.match).toBe('exact');
          for (const entry of result.entries) {
            const html = source.get(entry.id)?.source_html ?? '';
            if (hasOwnVerbMarker(html, entry.headword)) continue;
            if (entry.headword === row.canonical && exceptions.has(entry.headword)) {
              used.add(entry.headword);
              continue;
            }
            failures.push(`${row.form} → ${entry.headword}: source does not mark its own verb`);
          }
        }
        expect(failures).toEqual([]);
        expect([...exceptions].filter((key) => !used.has(key))).toEqual([]);
        expect(verbRows).toBe(876);
        expect(exactInflections).toBe(4);
      }),
    ).pipe(Effect.provide(layerWebsterBun({ filename }).pipe(Layer.provide(BunServices.layer)))),
);

it.scoped('the fast lexicon contains every required real key and no nonexistent keys', () =>
  Effect.gen(function* () {
    const db = yield* Effect.acquireRelease(
      Effect.sync(() => new Database(filename, { readonly: true, create: false })),
      (opened) => Effect.sync(() => opened.close()),
    );
    const required = new Set<string>();
    for (const row of domain.forms) {
      required.add(row.form);
      if (row.lemma !== 'none') required.add(row.lemma);
      if (row.canonical !== 'none') required.add(row.canonical);
      if (/(eth|est)$/u.test(row.form)) {
        const bare = row.form.slice(0, -3);
        required.add(row.form.slice(0, -2));
        required.add(bare);
        if (/([bcdfghjklmnpqrstvwxyz])\1$/u.test(bare)) required.add(bare.slice(0, -1));
      }
    }
    const real = new Set(
      db
        .query<{ key: string }, []>('SELECT DISTINCT key FROM entries')
        .all()
        .map((row) => row.key),
    );
    const fast = new Set(lexicon.keys);
    expect([...required].filter((key) => real.has(key) && !fast.has(key))).toEqual([]);
    expect([...fast].filter((key) => !real.has(key))).toEqual([]);
  }),
);

const actualDomain = WebsterService.use((service) =>
  Effect.gen(function* () {
    const failures: string[] = [];
    for (const row of domain.forms) {
      const result = yield* service.lookup(row.form);
      const expected: string[] = [];
      if (row.lemma !== 'none') expected.push(row.lemma);
      if (result.entries.map((entry) => entry.headword).join(',') !== expected.join(','))
        failures.push(
          `${row.form}: expected ${row.lemma}, got ${result.entries.map((entry) => entry.headword).join(',')}`,
        );
    }
    expect(failures).toEqual([]);
  }),
).pipe(Effect.provide(layerWebsterBun({ filename }).pipe(Layer.provide(BunServices.layer))));

it.scoped(
  'the complete KJV source census and every reviewed resolution agree with the real dictionary',
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const bytes = yield* fs.readFile(new URL('../../assets/kjv.json', import.meta.url).pathname);
      expect(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')).toBe(domain.sourceSha256);
      const kjv = yield* Schema.decodeEffect(
        Schema.fromJsonString(
          Schema.Struct({ verses: Schema.Array(Schema.Struct({ text: Schema.String })) }),
        ),
      )(new TextDecoder().decode(bytes));
      expect(kjv.verses).toHaveLength(31102);
      const counts = new Map<string, number>();
      const extras = new Set(domain.extraForms);
      for (const verse of kjv.verses)
        for (const form of verse.text.toLowerCase().match(/[a-z]+(?:['’-][a-z]+)*/gu) ?? []) {
          if (/(eth|est)$/u.test(form) || extras.has(form))
            counts.set(form, (counts.get(form) ?? 0) + 1);
        }
      expect(counts.size).toBe(970);
      expect(domain.forms.filter((row) => /(eth|est)$/u.test(row.form))).toHaveLength(962);
      expect([...counts].sort(([a], [b]) => a.localeCompare(b, 'en'))).toEqual(
        domain.forms
          .map((row): [string, number] => [row.form, row.frequency])
          .sort(([a], [b]) => a.localeCompare(b, 'en')),
      );
      yield* actualDomain;
    }).pipe(Effect.provide(BunServices.layer)),
);
