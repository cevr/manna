import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { leadFeast } from '../lead-feast.ts';
import { FigureSource } from '../source.ts';
import { BARS, MEASURES, STAGES } from './bars.ts';
import type { Plan } from './pipeline.ts';
import { verifyMember } from './run.ts';

/** The renders' hashes in a manifest. */
const RendersJson = Schema.fromJsonString(
  Schema.Struct({ renders: Schema.Record(Schema.String, Schema.String) }),
);

/** The pipeline at small size: the front view, a 4-frame bend and a 2-frame turn. */
const SMALL: Plan = { views: ['front'], bendFrames: 4, turnFrames: 2 };

describe('toon3d verify', () => {
  it.effect(
    'renders the lead twice in two page launches with the same bytes, and judges every bar',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const out = yield* fs.makeTempDirectoryScoped();
        const verdict = yield* verifyMember(
          'lead-feast',
          FigureSource.Parametric({ spec: leadFeast }),
          SMALL,
          out,
        );
        const manifest = yield* Schema.decodeEffect(RendersJson)(
          yield* fs.readFileString(`${out}/manifest.json`),
        );
        expect(Object.keys(manifest.renders)).toHaveLength(2 * (1 + 4 + 2) + 4);
        expect(verdict.checks.find((c) => c.id === 'determinism')).toMatchObject({
          pass: true,
          value: '0',
        });
        expect(verdict.checks.map((c) => c.id)).toEqual(BARS.map((b) => b.id));
        for (const row of BARS) {
          expect(MEASURES).toContain(row.measure);
          expect(STAGES).toContain(row.stage);
        }
        const text = yield* fs.readFileString(`${out}/verdict.md`);
        expect(text.split('\n')[0]).toMatch(/^(PASS|FAIL) \d+\/16 pass$/);
        for (const name of ['contact.png', 'bend.mp4', 'turn.mp4'])
          expect(yield* fs.exists(`${out}/${name}`)).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    // oxlint-disable-next-line film/tests-keep-their-strength -- the run launches headless Chrome twice and ffmpeg twice (spawn budget).
    120_000,
  );
});
