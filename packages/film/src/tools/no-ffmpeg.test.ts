import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem } from 'effect';

const repo = `${import.meta.dir}/../../../..`;

/** The docs an agent reads before touching the film's media. */
const DOCS = [
  'packages/film/README.md',
  'apps/animations/README.md',
  '.claude/skills/film/SKILL.md',
  '.claude/skills/film/CRAFT.md',
];

/** The CLI named: `ffmpeg`, `ffprobe`, or "the ffmpeg CLI". */
const NAMES_CLI = /`(ffmpeg|ffprobe)`|ffmpeg CLI/;

/** A clause that says the CLI is not used. */
const REFUSES = /\b(never|no|not|nothing|fails|refuses)\b/i;

/**
 * The clauses of `text` that name the CLI and do not refuse it: a paragraph
 * read as one line (Markdown wraps), cut at each sentence, `;` and table cell.
 */
const cliUsesIn = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replaceAll('\n', ' '))
    .flatMap((paragraph) => paragraph.split(/\.\s|;\s|\s\|\s/))
    .filter((clause) => NAMES_CLI.test(clause) && !REFUSES.test(clause));

describe('no ffmpeg CLI', () => {
  it.effect('a doc clause that names the CLI as a tool the film uses is found', () =>
    Effect.sync(() => {
      const stale = [
        "0. **Tools.** `bun run doctor` says whether headless Chromium, the logged-in `elevenlabs` CLI and `ffmpeg` (x264 for a software render's share copy; takes load and encode in-process) are there, and how to fix each that is not.",
        "| `@manna/film/tools` | Media (mediabunny, joining a film; the ffmpeg CLI for a software share copy, and the review's stills and phone copies), Narrator |",
      ];
      expect(stale.map((text) => cliUsesIn(text).length)).toEqual([1, 1]);
      expect(
        cliUsesIn('x264 runs in-process; never the ffmpeg CLI. Nothing needs an `ffmpeg`.'),
      ).toEqual([]);
    }),
  );

  it.effect.layer(BunServices.layer)('no doc says the film uses the ffmpeg CLI', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const found = yield* Effect.forEach(DOCS, (doc) =>
        Effect.map(fs.readFileString(`${repo}/${doc}`), (text) =>
          cliUsesIn(text).map((clause) => `${doc}: ${clause.trim().slice(0, 160)}`),
        ),
      );
      expect(found.flat()).toEqual([]);
    }),
  );
});
