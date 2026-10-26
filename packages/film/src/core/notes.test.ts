import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { layout } from './layout.ts';
import {
  addNote,
  emptyNotes,
  eventsSince,
  noteT,
  replyToNote,
  resolveNote,
  unresolved,
} from './notes.ts';
import type { NoteDraft, NotesFile } from './schema.ts';

const draft = (text: string): NoteDraft => ({ scene: 'a', T: 1, frame: 30, text });
const at = '2026-09-25T00:00:00.000Z';

describe('where a note shows', () => {
  const FPS = 30;
  /** Scene a lasts `aSeconds`, then scene `next` (`nextSeconds`, 6 s unless given). */
  const film = (aSeconds: number, next = 'b', nextSeconds = 6) =>
    Result.getOrThrow(
      layout(
        [
          { id: 'a', min: aSeconds },
          { id: next, min: nextSeconds },
        ],
        { voice: '', scenes: {} },
      ),
    );
  // Made 1.5 s into b while a lasted 5 s.
  const made: NoteDraft = { scene: 'b', T: 6.5, local: 1.5, frame: 195, text: 'too early' };

  test('a note follows its scene when an earlier beat is re-taken longer', () => {
    expect(noteT(film(5), FPS, made)).toBeCloseTo(6.5, 9);
    expect(noteT(film(7), FPS, made)).toBeCloseTo(8.5, 9);
  });

  test('a note made before scene-local times (no `local`) reads at its T', () => {
    const { local: _, ...old } = made;
    expect(noteT(film(7), FPS, old)).toBe(6.5);
  });

  test('a note whose scene is gone reads at its T', () => {
    expect(noteT(film(7, 'c'), FPS, made)).toBe(6.5);
  });

  test('a note on a scene’s last frame stays there when its exact length ends between frames', () => {
    // Scene a holds 3.04 s, laid to the nearest frame, 91 (`layout`): frame 90 (3 s) is its last.
    const onLast: NoteDraft = { scene: 'a', T: 90 / FPS, local: 90 / FPS, frame: 90, text: 'x' };
    expect(noteT(film(3.04), FPS, onLast)).toBe(90 / FPS);
  });

  test('a note past a scene whose exact length ends between frames holds on that scene’s last frame', () => {
    // b holds 6.04 s from 3 s, laid to frame 271 (9.0333 s): its last frame is 270 (9 s).
    const T = noteT(film(3, 'b', 6.04), FPS, { ...made, local: 9 });
    expect(T).toBeCloseTo(270 / FPS, 9);
  });

  test('a scene re-taken shorter than the note holds it on its last frame', () => {
    const late = { ...made, local: 9 };
    const T = noteT(film(5), FPS, late);
    expect(T).toBeCloseTo(5 + 6 - 1 / FPS, 9);
  });
});

describe('the note log', () => {
  const two = (): NotesFile =>
    addNote(addNote(emptyNotes('f'), draft('first'), at), draft('second'), at);

  test('each change takes the next number; a note’s id is its number', () => {
    const file = two();
    expect(file.seq).toBe(2);
    expect(file.notes.map((n) => [n.id, n.still, n.status])).toEqual([
      ['n1', 'n1.png', 'open'],
      ['n2', 'n2.png', 'open'],
    ]);
  });

  test('an agent reply marks a note replied, a user reply opens it, resolve closes it', () => {
    const replied = replyToNote(
      two(),
      'n1',
      { by: 'agent', text: 'moved', still: Option.some('n1.r3.png') },
      at,
    );
    expect(replied.notes[0]?.status).toBe('replied');
    expect(replied.notes[0]?.thread[0]).toEqual({
      seq: 3,
      by: 'agent',
      text: 'moved',
      still: 'n1.r3.png',
      at,
    });
    const reopened = replyToNote(
      replied,
      'n1',
      { by: 'user', text: 'lower', still: Option.none() },
      at,
    );
    expect(reopened.notes[0]?.status).toBe('open');
    const resolved = resolveNote(reopened, 'n1');
    expect(resolved.notes[0]?.status).toBe('resolved');
    expect(resolved.notes[0]?.changed).toBe(5);
    expect(unresolved(resolved).map((n) => n.id)).toEqual(['n2']);
  });
});

describe('eventsSince', () => {
  test('every change past the cursor, in order, and each exactly once', () => {
    let file = addNote(emptyNotes('f'), draft('first'), at);
    const first = eventsSince(file, 0);
    expect(first.events.map((e) => [e._tag, e.seq])).toEqual([['NoteAdded', 1]]);
    // Nothing new: nothing again.
    expect(eventsSince(file, first.cursor)).toEqual({ cursor: 1, events: [] });

    file = addNote(file, draft('second'), at);
    file = replyToNote(file, 'n1', { by: 'user', text: 'and', still: Option.none() }, at);
    file = resolveNote(file, 'n2');
    const next = eventsSince(file, first.cursor);
    expect(next.events.map((e) => [e._tag, e.seq, e.note.id])).toEqual([
      ['NoteAdded', 2, 'n2'],
      ['NoteReplied', 3, 'n1'],
      ['NoteResolved', 4, 'n2'],
    ]);
    expect(next.cursor).toBe(4);
    expect(eventsSince(file, next.cursor).events).toEqual([]);
  });

  test('from zero, the whole log replays', () => {
    const file = replyToNote(
      addNote(emptyNotes('f'), draft('first'), at),
      'n1',
      { by: 'agent', text: 'done', still: Option.none() },
      at,
    );
    expect(eventsSince(file, 0).events.map((e) => e._tag)).toEqual(['NoteAdded', 'NoteReplied']);
  });

  test('a file reset below the cursor (trashed, restored) replays its log at its own cursor', () => {
    const file = addNote(emptyNotes('f'), draft('after the reset'), at);
    const waited = eventsSince(file, 5);
    expect(waited.events.map((e) => [e._tag, e.seq])).toEqual([['NoteAdded', 1]]);
    expect(waited.cursor).toBe(1);
    expect(eventsSince(file, waited.cursor).events).toEqual([]);
  });
});
