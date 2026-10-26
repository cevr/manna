// Lab notes as pure data: where a note sits on the film (its scene and the
// nearest cue edge and mark), what a note on words asks of them, the changes
// a note log makes (add, reply, resolve), and the changes past a cursor,
// which is what makes a watcher see each one exactly once. The store (tools)
// does the I/O; the lab page and the tools both read these. Pure and
// DOM-free.

import { Array as Arr, Option, Order } from 'effect';
import { type Placed } from './layout.ts';
import type {
  Note,
  NoteAuthor,
  NoteDraft,
  NoteEvent,
  NotesFile,
  NoteStatus,
  NotesWait,
  Reply,
} from './schema.ts';
import { framesOf } from './time.ts';

/**
 * Film seconds `local` into placed scene `p`: as it is while inside the scene;
 * at or past its end (the scene got shorter), the scene's last frame, the last
 * one that starts before its end on the film's one frame grid (`framesOf`:
 * an end within a millionth of a frame past a frame start is not a frame).
 */
const inScene = (p: Pick<Placed, 'start' | 'dur'>, fps: number, local: number) => {
  if (local < p.dur) return p.start + local;
  return Math.max(p.start, framesOf({ from: p.start, to: p.start + p.dur }, fps).last / fps);
};

/**
 * The film time a note shows at now: `local` seconds into its scene while the
 * film has that scene, so a re-take of an earlier beat does not move it off its
 * frame (held on the scene's last frame if the scene got shorter than that);
 * else, and for a note made before `local`, its `T`.
 */
export const noteT = (
  placed: ReadonlyArray<Pick<Placed, 'start' | 'dur'> & { readonly spec: { readonly id: string } }>,
  fps: number,
  note: Pick<NoteDraft, 'scene' | 'T' | 'local'>,
): number =>
  Option.getOrElse(
    Option.flatMap(Option.fromUndefinedOr(note.local), (local) =>
      Option.map(
        Arr.findFirst(placed, (p) => p.spec.id === note.scene),
        (p) => inScene(p, fps, local),
      ),
    ),
    () => note.T,
  );

/** A film with no notes yet. */
export const emptyNotes = (film: string): NotesFile => ({ film, seq: 0, notes: [] });

/** The note `id` names. */
export const noteById = (file: NotesFile, id: string): Option.Option<Note> =>
  Arr.findFirst(file.notes, (n) => n.id === id);

/** The id and still file a note made at change `seq` gets. */
const noteId = (seq: number) => `n${seq}`;
const noteStill = (id: string) => `${id}.png`;
/** A reply's still: beside its note's, numbered by the reply's change. */
export const replyStill = (id: string, seq: number) => `${id}.r${seq}.png`;

/** Add a note made from `draft` as the next change. */
export const addNote = (file: NotesFile, draft: NoteDraft, at: string): NotesFile => {
  const seq = file.seq + 1;
  const id = noteId(seq);
  const note: Note = {
    ...draft,
    id,
    film: file.film,
    seq,
    changed: seq,
    status: 'open',
    still: noteStill(id),
    thread: [],
    createdAt: at,
  };
  return { ...file, seq, notes: [...file.notes, note] };
};

/** What a reply says, with its still when it has one. */
interface ReplyDraft {
  readonly by: NoteAuthor;
  readonly text: string;
  readonly still: Option.Option<string>;
}

const change = (file: NotesFile, id: string, f: (note: Note, seq: number) => Note): NotesFile => {
  const seq = file.seq + 1;
  return {
    ...file,
    seq,
    notes: file.notes.map((n) => {
      if (n.id !== id) return n;
      return { ...f(n, seq), changed: seq };
    }),
  };
};

/** A note's status once `by` has replied in its thread. */
const statusAfterReply = { agent: 'replied', user: 'open' } satisfies Record<
  NoteAuthor,
  NoteStatus
>;

/**
 * Add a reply to note `id` as the next change. The agent's reply marks it
 * `replied`; the user's opens it again. The caller checks that the note exists.
 */
export const replyToNote = (
  file: NotesFile,
  id: string,
  draft: ReplyDraft,
  at: string,
): NotesFile =>
  change(file, id, (note, seq) => {
    const reply: Reply = Option.match(draft.still, {
      onNone: () => ({ seq, by: draft.by, text: draft.text, at }),
      onSome: (still) => ({ seq, by: draft.by, text: draft.text, still, at }),
    });
    return {
      ...note,
      status: statusAfterReply[draft.by],
      thread: [...note.thread, reply],
    };
  });

/** Resolve note `id` as the next change. The caller checks that the note exists. */
export const resolveNote = (file: NotesFile, id: string): NotesFile =>
  change(file, id, (note) => ({ ...note, status: 'resolved' }));

/** Where to report from: `since`, or the start of a file reset below it. */
const reportFrom = (file: NotesFile, since: number) => {
  if (file.seq < since) return 0;
  return since;
};

/**
 * Every change after `since`, in the order made, and the cursor to pass next.
 * A note or reply is reported once: its change number never moves. A note
 * whose last change was resolving it is reported as resolved. A file whose
 * own cursor is below `since` was reset (trashed, moved or restored), so its
 * whole log is new to the watcher and the cursor is the file's.
 */
export const eventsSince = (file: NotesFile, since: number): NotesWait => {
  const from = reportFrom(file, since);
  const events = file.notes.flatMap((note): Array<NoteEvent> => {
    const out: Array<NoteEvent> = [];
    if (note.seq > from) out.push({ _tag: 'NoteAdded', seq: note.seq, note });
    for (const reply of note.thread)
      if (reply.seq > from) out.push({ _tag: 'NoteReplied', seq: reply.seq, note, reply });
    if (note.status === 'resolved' && note.changed > from)
      out.push({ _tag: 'NoteResolved', seq: note.changed, note });
    return out;
  });
  return {
    cursor: file.seq,
    events: Arr.sort(
      events,
      Order.mapInput(Order.Number, (e: NoteEvent) => e.seq),
    ),
  };
};

/** The notes still waiting on someone: open, or replied and not yet resolved. */
export const unresolved = (file: NotesFile): ReadonlyArray<Note> =>
  file.notes.filter((n) => n.status !== 'resolved');
