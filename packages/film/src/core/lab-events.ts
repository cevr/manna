import { Array as Arr, Boolean as Bool, Match, Option, Record, Schema } from 'effect';
import { addressKey } from './address.ts';
import {
  AskAnswer,
  type AskAnswers,
  type AskName,
  type AskRecord,
  answeredToEnd,
  answersLine,
  askedIn,
} from './ask.ts';
import { pageHref } from './api.ts';
import type { BoardFile, Panel } from './board.ts';
import type { Catalogue } from './catalogue.ts';
import { type PointRef, pointIdOf } from './point.ts';
import type { ProductionFile } from './production.ts';
import { FNV_START, fnvText } from './random.ts';
import { eventsSince } from './notes.ts';
import type { Note, NoteEvent, NotesFile } from './schema.ts';

export const LabLinks = Schema.Struct({
  local: Schema.String,
  phone: Schema.optionalKey(Schema.String),
});
export type LabLinks = typeof LabLinks.Type;

export const linksAt = (links: LabLinks, at: string): LabLinks => ({
  local: new URL(at, links.local).href,
  ...Option.match(Option.fromUndefinedOr(links.phone), {
    onNone: () => ({}),
    onSome: (phone) => ({ phone: new URL(at, phone).href }),
  }),
});

const ReadCommand = Schema.Struct({
  tool: Schema.optionalKey(
    Schema.Struct({
      name: Schema.String,
      arguments: Schema.Record(Schema.String, Schema.String),
    }),
  ),
  cli: Schema.String,
});
type ReadCommand = typeof ReadCommand.Type;

interface ReadFrom {
  readonly film?: string;
  readonly beat?: string;
  readonly set?: string;
  readonly ask?: string;
  readonly production?: string;
}

const BARE_WORD = /^[A-Za-z0-9_./:@%+=,-]+$/;

const shellWord = (word: string): string =>
  Bool.match(BARE_WORD.test(word), {
    onTrue: () => word,
    onFalse: () => `'${word.replaceAll("'", `'\\''`)}'`,
  });

const labRead = (tool: string, args: ReadonlyArray<readonly [string, string]>): ReadCommand => ({
  tool: { name: tool, arguments: Object.fromEntries(args) },
  cli: ['bun cli.ts lab', tool, ...args.map(([key, value]) => `--${key} ${shellWord(value)}`)].join(
    ' ',
  ),
});

const given = (
  from: ReadFrom,
  keys: ReadonlyArray<keyof ReadFrom>,
): ReadonlyArray<readonly [string, string]> =>
  keys.flatMap((key) =>
    Option.toArray(Option.map(Option.fromUndefinedOr(from[key]), (value) => [key, value] as const)),
  );

const notesRead = (from: ReadFrom) =>
  labRead('notes', [...given(from, ['film']), ['status', 'all']]);
const boardRead = (from: ReadFrom) => labRead('board', given(from, ['film', 'beat']));
const catalogueRead = (from: ReadFrom) => labRead('catalogue', given(from, ['set']));
const setRead = (from: ReadFrom) => labRead('set', given(from, ['set']));
const askRead = (from: ReadFrom) => labRead('ask_read', given(from, ['ask']));
const productionRead = (from: ReadFrom): ReadCommand =>
  Option.match(Option.fromUndefinedOr(from.film), {
    onSome: (film) => labRead('timeline', [['film', film]]),
    onNone: () => ({
      cli: `bun cli.ts production show ${shellWord(from.production ?? '')}`,
    }),
  });

const sourceRead = (from: ReadFrom) => labRead('timeline', given(from, ['film']));

const RECORDS = {
  notes: notesRead,
  board: boardRead,
  catalogue: catalogueRead,
  set: setRead,
  ask: askRead,
  production: productionRead,
  source: sourceRead,
} satisfies Record<string, (from: ReadFrom) => ReadCommand>;

interface LabEventDefinition {
  readonly description: string;
  readonly record: keyof typeof RECORDS;
}

export const LAB_EVENTS = {
  'note.replied': { description: "A reply in a note's thread.", record: 'notes' },
  'note.resolved': { description: 'A note marked done.', record: 'notes' },
  'tweak.requested': {
    description: 'A note on a panel that asks for it to be made again (`film board tweak`).',
    record: 'notes',
  },
  'board.kept': { description: "A panel's try kept (or a different one kept).", record: 'board' },
  'board.tried': { description: 'A try added to a panel.', record: 'board' },
  'beat.approved': { description: "A beat's board approved as it stands.", record: 'board' },
  'beat.withdrawn': { description: "A beat's board approval withdrawn.", record: 'board' },
  'render.commented': { description: "A comment on a render's version.", record: 'catalogue' },
  'render.approved': { description: "A render's version approved.", record: 'catalogue' },
  'render.withdrawn': { description: "A render's approval withdrawn.", record: 'catalogue' },
  'render.recorded': {
    description: "A render recorded in a project folder's catalogue.",
    record: 'catalogue',
  },
  'set.published': {
    description: 'A set (a folder with a `review.json`) that was not there before.',
    record: 'set',
  },
  'set.updated': { description: "A set's `review.json` written again.", record: 'set' },
  'ask.step': {
    description: "A step of an agent's ask answered by the owner: that step's answers, typed.",
    record: 'ask',
  },
  'ask.answered': {
    description: 'An ask answered to its end: every answer, typed.',
    record: 'ask',
  },
  'ask.closed': { description: 'An ask closed by its agent.', record: 'ask' },
  'production.decided': {
    description:
      "The owner's decision filed on a production's timeline (from chat, or by an ask he answered).",
    record: 'production',
  },
  'production.noted': {
    description:
      "A note filed on a production's timeline: the owner's feedback (with his words as its quote), or an agent's work note (`by: agent`).",
    record: 'production',
  },
  'production.asked': {
    description: "A question an agent's ask put on a production's timeline.",
    record: 'production',
  },
  'production.forwarded': {
    description: 'A production moved into its next version.',
    record: 'production',
  },
  'source.written': {
    description:
      "A film's source changed through the lab's writer, by an ask's script or an agent's tool: a beat moved or a hold trimmed, a delivery mark, a pick written.",
    record: 'source',
  },
  'source.undone': { description: "A change to a film's source undone.", record: 'source' },
} satisfies Record<string, LabEventDefinition>;

const LabEventName = Schema.Literals(Record.keys(LAB_EVENTS));

const recordOf = (name: string): Option.Option<string> =>
  Option.map(
    Arr.findFirst(Record.toEntries(LAB_EVENTS), ([kind]) => kind === name),
    ([, definition]) => definition.record,
  );

export const namesMatch = (globs: ReadonlyArray<string>, name: string): boolean =>
  Arr.match(globs, {
    onEmpty: () => true,
    onNonEmpty: (all) =>
      all.some(
        (glob) =>
          Option.contains(recordOf(name), glob) ||
          new RegExp(
            `^${glob
              .split('*')
              .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
              .join('.*')}$`,
          ).test(name),
      ),
  });

export const changeAsked =
  (names: ReadonlyArray<string>, film: Option.Option<string>) =>
  (change: { readonly kind: string; readonly film?: string }): boolean =>
    namesMatch(names, change.kind) &&
    Option.match(film, {
      onNone: () => true,
      onSome: (one) => change.film === one,
    });

const PAYLOAD_MAX_BYTES = 240 * 1024;

const LabActor = Schema.Literals(['owner', 'agent']);
type LabActor = typeof LabActor.Type;

export const LabChange = Schema.Struct({
  seq: Schema.Int,
  at: Schema.String,
  id: Schema.String,
  kind: LabEventName,
  by: Schema.optionalKey(LabActor),
  film: Schema.optionalKey(Schema.String),
  set: Schema.optionalKey(Schema.String),
  note: Schema.optionalKey(Schema.String),
  panel: Schema.optionalKey(Schema.String),
  beat: Schema.optionalKey(Schema.String),
  try: Schema.optionalKey(Schema.Int),
  address: Schema.optionalKey(Schema.String),
  variant: Schema.optionalKey(Schema.String),
  text: Schema.optionalKey(Schema.String),
  production: Schema.optionalKey(Schema.String),
  version: Schema.optionalKey(Schema.Int),
  ask: Schema.optionalKey(Schema.String),
  step: Schema.optionalKey(Schema.String),
  answers: Schema.optionalKey(Schema.Record(Schema.String, AskAnswer)),
  summary: Schema.String,
  links: LabLinks,
  read: ReadCommand,
  trimmed: Schema.optionalKey(Schema.Boolean),
});
export type LabChange = typeof LabChange.Type;

const ForeignChange = Schema.Struct({
  seq: Schema.Int,
  at: Schema.String,
  id: Schema.optionalKey(Schema.String),
  kind: Schema.String,
  by: Schema.optionalKey(Schema.String),
  film: Schema.optionalKey(Schema.String),
  set: Schema.optionalKey(Schema.String),
  note: Schema.optionalKey(Schema.String),
  panel: Schema.optionalKey(Schema.String),
  beat: Schema.optionalKey(Schema.String),
  try: Schema.optionalKey(Schema.Int),
  address: Schema.optionalKey(Schema.String),
  variant: Schema.optionalKey(Schema.String),
  text: Schema.optionalKey(Schema.String),
  production: Schema.optionalKey(Schema.String),
  ask: Schema.optionalKey(Schema.String),
  step: Schema.optionalKey(Schema.String),
  summary: Schema.String,
  links: LabLinks,
  read: Schema.optionalKey(Schema.Struct({ cli: Schema.String })),
});

export const HeardChange = Schema.Union([LabChange, ForeignChange]);
export type HeardChange = typeof HeardChange.Type;

export const isKnownChange: (change: HeardChange) => change is LabChange = Schema.is(LabChange);

export type LabChangeDraft = Omit<LabChange, 'seq' | 'at' | 'id' | 'links' | 'read' | 'trimmed'> & {
  readonly path: string;
  readonly origin: string;
};

const changeId = (kind: string, origin: string): string => {
  const text = `${kind} ${origin}`;
  const half = (start: number) => (fnvText(start, text) >>> 0).toString(16).padStart(8, '0');
  return `${half(FNV_START)}${half(FNV_SECOND)}`;
};

const FNV_SECOND = ~FNV_START >>> 0;

export const gist = (text: string, max = 120): string => {
  const line = text.replace(/\s+/g, ' ').trim();
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1)}…`;
};

const aboutNote = (note: Note): string =>
  Option.match(Option.fromUndefinedOr(note.panel), {
    onSome: (panel) => `panel ${panel.id}`,
    onNone: () =>
      Option.match(Option.fromUndefinedOr(note.words), {
        onSome: (words) => `"${gist(words.text, 40)}" in ${words.beat}`,
        onNone: () => `scene ${note.scene}`,
      }),
  });

const noteFields = (note: Note) => ({
  film: note.film,
  note: note.id,
  ...Option.match(Option.fromUndefinedOr(note.panel), {
    onNone: () => ({}),
    onSome: (panel) => ({
      panel: panel.id,
      beat: note.scene,
      ...Option.match(Option.fromUndefinedOr(panel.try), {
        onNone: () => ({}),
        onSome: (n) => ({ try: n }),
      }),
    }),
  }),
  path: pageHref.home(),
});

const actorOf = (by: NoteEvent['note']['thread'][number]['by']): LabActor =>
  Bool.match(by === 'user', { onTrue: () => 'owner', onFalse: () => 'agent' });

const noteOrigin = (note: Note, seq: number) =>
  `notes/${note.film}/${note.id}@${note.createdAt}/${seq}`;

const noteChange = Match.type<NoteEvent>().pipe(
  Match.tagsExhaustive({
    NoteAdded: ({ note, seq }): LabChangeDraft => ({
      ...noteFields(note),
      origin: noteOrigin(note, seq),
      kind: 'tweak.requested',
      by: 'owner',
      text: note.text,
      summary: `${note.film} ${note.id}: tweak asked of ${aboutNote(note)}: ${gist(note.text)}`,
    }),
    NoteReplied: ({ note, reply, seq }): LabChangeDraft => {
      const by = actorOf(reply.by);
      return {
        ...noteFields(note),
        origin: noteOrigin(note, seq),
        kind: 'note.replied',
        by,
        text: reply.text,
        summary: `${note.film} ${note.id}: ${by} replied: ${gist(reply.text)}`,
      };
    },
    NoteResolved: ({ note, seq }): LabChangeDraft => ({
      ...noteFields(note),
      origin: noteOrigin(note, seq),
      kind: 'note.resolved',
      text: note.text,
      summary: `${note.film} ${note.id} done: ${gist(note.text)}`,
    }),
  }),
);

const toldNote = (event: NoteEvent): boolean =>
  event._tag !== 'NoteAdded' || event.note.panel?.ask === 'tweak';

export const noteChanges = (events: ReadonlyArray<NoteEvent>): ReadonlyArray<LabChangeDraft> =>
  events.filter(toldNote).map(noteChange);

interface NotesRead {
  readonly seq: number;
  readonly notes: ReadonlyArray<Note>;
}

const noteKey = (note: Note) => `${note.id}@${note.createdAt}`;

const notesReset = (before: NotesRead, after: NotesRead): boolean => {
  const held = new Set(before.notes.map(noteKey));
  return (
    after.seq < before.seq || after.notes.some((n) => !held.has(noteKey(n)) && n.seq <= before.seq)
  );
};

export const notesNews = (before: NotesRead, after: NotesFile): ReadonlyArray<LabChangeDraft> =>
  Bool.match(notesReset(before, after), {
    onTrue: () => noteChanges(eventsSince(after, 0).events),
    onFalse: () => noteChanges(eventsSince(after, before.seq).events),
  });

const panelIn = (board: BoardFile, id: string): Option.Option<Panel> =>
  Arr.findFirst(board.panels, (p) => p.id === id);

export const boardChanges = (
  before: BoardFile,
  after: BoardFile,
  read: string,
): ReadonlyArray<LabChangeDraft> => {
  const film = after.film;
  const panels = after.panels.flatMap((panel): Array<LabChangeDraft> => {
    const was = panelIn(before, panel.id);
    const where = { film, panel: panel.id, beat: panel.beat };
    const known = new Set(
      Option.match(was, { onNone: () => [], onSome: (p) => p.tries.map((t) => t.n) }),
    );
    const tried = panel.tries
      .filter((t) => !known.has(t.n))
      .map((t): LabChangeDraft => ({
        ...where,
        kind: 'board.tried',
        origin: `board/${film}/${panel.id}/${t.n}@${t.at}`,
        try: t.n,
        ...Option.match(Option.fromUndefinedOr(t.note), {
          onNone: () => ({}),
          onSome: (note) => ({ note }),
        }),
        summary: `${film} ${panel.id}: try ${t.n} added (${t.made}${Option.match(Option.fromUndefinedOr(t.note), { onNone: () => '', onSome: (n) => ` for ${n}` })})`,
        path: pageHref.home(),
      }));
    const keptBefore = Option.flatMap(was, (p) => Option.fromUndefinedOr(p.kept));
    const kept = Option.filter(
      Option.fromUndefinedOr(panel.kept),
      (n) => !Option.contains(keptBefore, n),
    );
    const keeps = Option.toArray(
      Option.map(kept, (n): LabChangeDraft => ({
        ...where,
        kind: 'board.kept',
        origin: `board/${film}/${panel.id}/${n}/${read}`,
        try: n,
        ...Option.match(Option.fromUndefinedOr(panel.why), {
          onNone: () => ({}),
          onSome: (text) => ({ text }),
        }),
        summary: `${film} ${panel.id}: try ${n} kept${Option.match(Option.fromUndefinedOr(panel.why), { onNone: () => '', onSome: (why) => `: ${gist(why)}` })}`,
        path: pageHref.home(),
      })),
    );
    return [...tried, ...keeps];
  });
  const approvalKey = (a: BoardFile['approvals'][number]) => `${a.beat} ${a.at}`;
  const had = new Set(before.approvals.map(approvalKey));
  const has = new Set(after.approvals.map(approvalKey));
  const approved = after.approvals
    .filter((a) => !had.has(approvalKey(a)))
    .map((a): LabChangeDraft => ({
      film,
      beat: a.beat,
      kind: 'beat.approved',
      origin: `board/${film}/${approvalKey(a)}`,
      summary: `${film} beat ${a.beat}: board approved (${a.kept.map((k) => `${k.panel}#${k.try}`).join(', ')})`,
      path: pageHref.home(),
    }));
  const stillApproved = new Set(after.approvals.map((a) => a.beat));
  const withdrawn = before.approvals
    .filter((a) => !has.has(approvalKey(a)) && !stillApproved.has(a.beat))
    .map((a): LabChangeDraft => ({
      film,
      beat: a.beat,
      kind: 'beat.withdrawn',
      origin: `board/${film}/${approvalKey(a)}`,
      summary: `${film} beat ${a.beat}: board approval withdrawn`,
      path: pageHref.home(),
    }));
  return [...panels, ...approved, ...withdrawn];
};

const pointIdAbout = (say: Pick<Catalogue['comments'][number], 'address' | 'point'>): string =>
  pointIdOf(
    Option.getOrElse(say.point, (): PointRef => ({ _tag: 'Render', address: say.address })),
  );

export const catalogueChanges = (
  set: string,
  before: Catalogue,
  after: Catalogue,
): ReadonlyArray<LabChangeDraft> => {
  const film = after.film;
  const about = (say: Pick<Catalogue['comments'][number], 'address' | 'point' | 'variant'>) => ({
    film,
    set,
    address: addressKey(say.address),
    variant: say.variant,
    path: pageHref.home(),
  });
  const named = (say: Pick<Catalogue['comments'][number], 'address' | 'point' | 'variant'>) =>
    `${film} ${pointIdAbout(say)} ${say.variant}`;
  const said = new Set(before.comments.map((c) => c.id));
  const comments = after.comments
    .filter((c) => !said.has(c.id))
    .map((c): LabChangeDraft => ({
      ...about(c),
      kind: 'render.commented',
      origin: `catalogue/${set}/${c.id}`,
      by: 'owner',
      note: c.id,
      text: c.text,
      summary: `${named(c)}: ${c.id}: ${gist(c.text)}`,
    }));
  const approvalKey = (a: Catalogue['approvals'][number]) =>
    `${pointIdAbout(a)} ${a.variant} ${a.key} ${a.at}`;
  const had = new Set(before.approvals.map(approvalKey));
  const has = new Set(after.approvals.map(approvalKey));
  const approved = after.approvals
    .filter((a) => !had.has(approvalKey(a)))
    .map((a): LabChangeDraft => ({
      ...about(a),
      kind: 'render.approved',
      origin: `catalogue/${set}/${approvalKey(a)}`,
      summary: `${named(a)}: approved`,
    }));
  const withdrawn = before.approvals
    .filter((a) => !has.has(approvalKey(a)))
    .map((a): LabChangeDraft => ({
      ...about(a),
      kind: 'render.withdrawn',
      origin: `catalogue/${set}/${approvalKey(a)}`,
      summary: `${named(a)}: approval withdrawn`,
    }));
  const renderKey = (r: Catalogue['renders'][number]) =>
    `${addressKey(r.address)} ${r.variant} ${r.kind} ${r.at}`;
  const recorded = new Set(before.renders.map(renderKey));
  const renders = after.renders
    .filter((r) => !recorded.has(renderKey(r)))
    .map((r): LabChangeDraft => ({
      film,
      set,
      address: addressKey(r.address),
      variant: r.variant,
      kind: 'render.recorded',
      origin: `catalogue/${set}/${renderKey(r)}`,
      summary: `${film} ${addressKey(r.address)} ${r.variant}: ${r.kind} recorded`,
      path: pageHref.home(),
    }));
  return [...comments, ...approved, ...withdrawn, ...renders];
};

export interface SetSeen {
  readonly title: Option.Option<string>;
  readonly stamp: string;
}

export const setChanges = (
  before: ReadonlyMap<string, SetSeen>,
  after: ReadonlyMap<string, SetSeen>,
): ReadonlyArray<LabChangeDraft> =>
  [...after].flatMap(([set, seen]): Array<LabChangeDraft> => {
    const was = Option.fromUndefinedOr(before.get(set));
    const titled = Option.match(seen.title, { onNone: () => set, onSome: (t) => `${set} (${t})` });
    if (Option.isNone(was))
      return [
        {
          set,
          kind: 'set.published',
          origin: `set/${set}/${seen.stamp}`,
          summary: `set ${titled} published`,
          path: pageHref.home(),
        },
      ];
    if (was.value.stamp === seen.stamp) return [];
    return [
      {
        set,
        kind: 'set.updated',
        origin: `set/${set}/${seen.stamp}`,
        summary: `set ${titled} updated`,
        path: pageHref.home(),
      },
    ];
  });

const answersOf = (record: AskRecord, step: AskName): AskAnswers =>
  Option.match(Record.get(record.ask.steps, step), {
    onNone: () => ({}),
    onSome: (at) =>
      Record.filter(record.state.answers, (_, id) => askedIn(at).some((b) => b.id === id)),
  });

export const askChanges = (
  before: Option.Option<AskRecord>,
  after: AskRecord,
): ReadonlyArray<LabChangeDraft> => {
  const was = Option.match(before, { onNone: () => 0, onSome: (b) => b.answered.length });
  const path = pageHref.ask(after.id);
  const of = {
    ask: after.id,
    ...Option.match(Option.fromUndefinedOr(after.film), {
      onNone: () => ({}),
      onSome: (film) => ({ film }),
    }),
  };
  const steps = after.answered.slice(was).map((a, i): LabChangeDraft => {
    const answers = answersOf(after, a.step);
    return {
      ...of,
      kind: 'ask.step',
      origin: `ask/${after.id}/${was + i}`,
      by: 'owner',
      step: a.step,
      answers,
      summary: `ask ${after.id} (${gist(after.title, 60)}) step ${a.step} answered: ${gist(answersLine(answers), 200)}`,
      path,
    };
  });
  const held = (test: (r: AskRecord) => boolean) => Option.exists(before, test);
  const answered = Arr.filter(
    [
      {
        ...of,
        kind: 'ask.answered' as const,
        origin: `ask/${after.id}`,
        by: 'owner' as const,
        answers: after.state.answers,
        summary: `ask ${after.id} (${gist(after.title, 60)}) answered: ${gist(answersLine(after.state.answers), 200)}`,
        path,
      },
    ],
    () => answeredToEnd(after) && !held(answeredToEnd),
  );
  const isClosed = (r: AskRecord) => r.state._tag === 'Closed';
  const closed = Match.value(after.state).pipe(
    Match.tag('Closed', (s): ReadonlyArray<LabChangeDraft> => [
      {
        ...of,
        kind: 'ask.closed',
        origin: `ask/${after.id}`,
        by: 'agent',
        text: s.why,
        answers: s.answers,
        summary: `ask ${after.id} (${gist(after.title, 60)}) closed: ${gist(s.why, 80)}`,
        path,
      },
    ]),
    Match.orElse((): ReadonlyArray<LabChangeDraft> => []),
  );
  return [...steps, ...answered, ...Arr.filter(closed, () => !held(isClosed))];
};

const saidBy = (word: ProductionFile['said'][number]): LabActor =>
  Bool.match(word._tag === 'Asked' || (word._tag === 'Noted' && Option.isNone(word.quote)), {
    onTrue: () => 'agent',
    onFalse: () => 'owner',
  });

export const productionChanges = (
  before: Option.Option<ProductionFile>,
  after: ProductionFile,
): ReadonlyArray<LabChangeDraft> => {
  const of = {
    production: after.production,
    ...Option.match(after.film, { onNone: () => ({}), onSome: (film) => ({ film }) }),
  };
  const wordKey = (word: ProductionFile['said'][number]) => `${word._tag} ${word.at} ${word.text}`;
  const known = new Set(
    Option.match(before, { onNone: () => [], onSome: (b) => b.said.map(wordKey) }),
  );
  const versions = Option.match(before, { onNone: () => 0, onSome: (b) => b.versions.length });
  const kinds = {
    Decided: 'production.decided',
    Noted: 'production.noted',
    Asked: 'production.asked',
  } as const;
  const verbs = { Decided: 'decided', Noted: 'noted', Asked: 'asked' } as const;
  const said = after.said
    .filter((word) => !known.has(wordKey(word)))
    .map((word): LabChangeDraft => ({
      ...of,
      kind: kinds[word._tag],
      origin: `production/${after.production}/${wordKey(word)}`,
      by: saidBy(word),
      text: word.text,
      ...Option.match(word.set, { onNone: () => ({}), onSome: (set) => ({ set }) }),
      ...Option.match(word.ask, { onNone: () => ({}), onSome: (ask) => ({ ask }) }),
      summary: `${after.production} ${verbs[word._tag]}: ${gist(word.text)}`,
      path: pageHref.home(),
    }));
  const opened = after.versions.slice(versions).map((version, i): LabChangeDraft => {
    const number = versions + i + 1;
    return {
      ...of,
      kind: 'production.forwarded',
      origin: `production/${after.production}/${number}`,
      version: number,
      text: version.title,
      summary: `${after.production} v${number}: ${gist(version.title)}`,
      path: pageHref.home(),
    };
  });
  return [...said, ...Arr.filter(opened, () => Option.isSome(before))];
};

const jsonBytes = (change: LabChange) =>
  new TextEncoder().encode(Schema.encodeSync(Schema.fromJsonString(LabChange))(change)).length;

const bounded = (change: LabChange): LabChange =>
  Bool.match(jsonBytes(change) <= PAYLOAD_MAX_BYTES, {
    onTrue: () => change,
    onFalse: () => {
      const { answers: _answers, text, ...rest } = change;
      return {
        ...rest,
        ...Option.match(Option.fromUndefinedOr(text), {
          onNone: () => ({}),
          onSome: (words) => ({ text: gist(words, 2000) }),
        }),
        trimmed: true,
      };
    },
  });

export const changeOf = (
  { path: place, origin, ...draft }: LabChangeDraft,
  seq: number,
  at: string,
  links: LabLinks,
): LabChange =>
  bounded({
    ...draft,
    seq,
    at,
    id: changeId(draft.kind, origin),
    links: linksAt(links, place),
    read: RECORDS[LAB_EVENTS[draft.kind].record](draft),
  });

interface SourceLanding {
  readonly n: number;
  readonly verb: 'write' | 'undo';
  readonly change: {
    readonly id: string;
    readonly film: string;
    readonly scene: Option.Option<string>;
    readonly target: string;
  };
}

const SOURCE_STEPS = {
  write: { kind: 'source.written', says: 'changed' },
  undo: { kind: 'source.undone', says: 'undid' },
} as const;

export const sourceChanges = (
  landings: ReadonlyArray<SourceLanding>,
): ReadonlyArray<LabChangeDraft> =>
  landings.map(({ n, verb, change }): LabChangeDraft => {
    const step = SOURCE_STEPS[verb];
    return {
      kind: step.kind,
      origin: `source/${change.film}/${change.id}/${verb}/${n}`,
      film: change.film,
      ...Option.match(change.scene, { onNone: () => ({}), onSome: (beat) => ({ beat }) }),
      text: change.target,
      summary: `${change.film} ${step.says}: ${gist(change.target)}${Option.match(change.scene, {
        onNone: () => '',
        onSome: (scene) => ` (${scene})`,
      })}`,
      path: pageHref.home(),
    };
  });
