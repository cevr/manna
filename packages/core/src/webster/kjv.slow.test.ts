import { BunServices } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
import { Effect, FileSystem, Layer, Schema } from 'effect';
import { expect, it } from 'effect-bun-test';

import domain from './fixtures/kjv-endings.json';
import { WebsterService } from './service.js';
import { layerWebsterBun } from './service-bun.js';

const filename = new URL('../../data/webster.db', import.meta.url).pathname;
// Source labels, including the pinned transcription's abbreviation and grammar
// entries. A matching headword alone does not establish that it is the verb.
const verbMarker =
  /<i>verb\b|<i>v<\/i>\.|<\/b>,?\s*(?:v\.|V[TI]\b|(?:the )?second person\b|past tense of the substantive verb\b)/iu;

it.scoped('every KJV verb form resolves to a source-marked verb or no entry', () =>
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
      const failures: string[] = [];
      expect(domain.forms).toHaveLength(970);
      for (const row of domain.forms) {
        if (row.kind !== 'verb') continue;
        const result = yield* service.lookup(row.form);
        for (const entry of result.entries) {
          const html = source.get(entry.id)?.source_html ?? '';
          const sameWordException =
            entry.headword === row.canonical && exceptions.has(entry.headword);
          if (!verbMarker.test(html) && !sameWordException)
            failures.push(`${row.form} → ${entry.headword}: source does not mark a verb`);
        }
      }
      expect(failures).toEqual([]);
    }),
  ).pipe(Effect.provide(layerWebsterBun({ filename }).pipe(Layer.provide(BunServices.layer)))),
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
