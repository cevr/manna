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
import { framesOf, secondsAt } from './time.ts';

const inScene = (p: Pick<Placed, 'start' | 'dur'>, fps: number, local: number) => {
  if (local < p.dur) return p.start + local;
  return Math.max(
    p.start,
    secondsAt(framesOf({ from: p.start, to: p.start + p.dur }, fps).last, fps),
  );
};

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

export const emptyNotes = (film: string): NotesFile => ({ film, seq: 0, notes: [] });

export const noteById = (file: NotesFile, id: string): Option.Option<Note> =>
  Arr.findFirst(file.notes, (n) => n.id === id);

const noteId = (seq: number) => `n${seq}`;
const noteStill = (id: string) => `${id}.png`;
export const replyStill = (id: string, seq: number) => `${id}.r${seq}.png`;

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

const statusAfterReply = { agent: 'replied', user: 'open' } satisfies Record<
  NoteAuthor,
  NoteStatus
>;

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

export const resolveNote = (file: NotesFile, id: string): NotesFile =>
  change(file, id, (note) => ({ ...note, status: 'resolved' }));

const reportFrom = (file: NotesFile, since: number) => {
  if (file.seq < since) return 0;
  return since;
};

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

export const unresolved = (file: NotesFile): ReadonlyArray<Note> =>
  file.notes.filter((n) => n.status !== 'resolved');
