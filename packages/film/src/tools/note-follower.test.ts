import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path } from 'effect';
import { namesMatch, noteChanges } from '../core/lab-events.ts';
import { addNote, emptyNotes, eventsSince, replyToNote } from '../core/notes.ts';
import type { NoteEvent } from '../core/schema.ts';

const DOCS = [
  '.claude/skills/film/SKILL.md',
  'packages/film/README.md',
  'apps/animations/plans/lab.md',
  'apps/animations/plans/lab-mcp.md',
  'apps/animations/README.md',
];

const watchPrinted = (event: NoteEvent) =>
  event._tag === 'NoteAdded' || (event._tag === 'NoteReplied' && event.reply.by === 'user');

const printedKinds = () => {
  const at = '2026-10-18T10:00:00.000Z';
  const draft = { scene: 'cold', T: 1, frame: 30 };
  const noted = addNote(emptyNotes('f'), { ...draft, text: 'hand lower' }, at);
  const tweaked = addNote(
    noted,
    { ...draft, text: 'warmer light', panel: { id: 'cold.judge', try: 1, ask: 'tweak' } },
    at,
  );
  const replied = replyToNote(
    replyToNote(tweaked, 'n1', { by: 'agent', text: 'done', still: Option.none() }, at),
    'n1',
    { by: 'user', text: 'and the other hand', still: Option.none() },
    at,
  );
  return noteChanges(eventsSince(replied, 0).events.filter(watchPrinted)).map((c) => c.kind);
};

const namesIn = (command: string) =>
  Array.from(
    command.replace(/[[\]]/g, ' ').matchAll(/--name\s+(?:'([^']*)'|"([^"]*)"|(\S+))/g),
    ([, single, double, bare]) => single ?? double ?? bare ?? '',
  );

const followersIn = (doc: string) =>
  doc.split('\n').flatMap((line) => [
    ...Array.from(
      line.matchAll(/`([^`]*lab events --follow[^`]*|--name \S+)`/g),
      ([, span = '']) => span,
    )
      .filter(() => /note/i.test(line))
      .map((command) => ({ command, names: namesIn(command), warns: /\bmiss/i.test(line) })),
    ...Array.from(
      line.matchAll(/^(bun run lab events \[--follow\].*?)\s+#/g),
      ([, command = '']) => ({ command, names: namesIn(command), warns: false }),
    ),
  ]);

describe('the note follower the docs give', () => {
  it.effect.layer(BunServices.layer)(
    'hears every event the old notes --watch printed, a tweak asked among them',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = path.join(import.meta.dir, '..', '..', '..', '..');
        const kinds = printedKinds();
        expect(kinds).toEqual(['tweak.requested', 'note.replied']);
        for (const file of DOCS) {
          const spans = followersIn(yield* fs.readFileString(path.join(root, file)));
          const followers = spans.filter((span) => !span.warns);
          expect({ file, followers: followers.length > 0 }).toEqual({ file, followers: true });
          for (const follower of followers)
            expect({
              file,
              command: follower.command,
              deaf: kinds.filter((kind) => !namesMatch(follower.names, kind)),
            }).toEqual({ file, command: follower.command, deaf: [] });
          for (const warning of spans.filter((span) => span.warns))
            expect({
              file,
              command: warning.command,
              misses: kinds.some((kind) => !namesMatch(warning.names, kind)),
            }).toEqual({ file, command: warning.command, misses: true });
        }
      }),
  );

  it.effect('reads a warning apart from a follower', () =>
    Effect.sync(() => {
      const [warning] = followersIn("A note follower: `--name 'note.*'` misses `tweak.requested`.");
      const [follower] = followersIn('A note follower: `--name notes`.');
      expect(warning).toEqual({ command: "--name 'note.*'", names: ['note.*'], warns: true });
      expect(follower).toEqual({ command: '--name notes', names: ['notes'], warns: false });
      expect(printedKinds().some((kind) => !namesMatch(warning?.names ?? [], kind))).toBe(true);
    }),
  );
});
