import { useAtomSet, useAtomValue } from '@manna/atom-solid';
import { Effect, Match, Option, Record } from 'effect';
import * as ActorAtom from 'effect-machine/atom';
import type { Accessor, ParentProps } from 'solid-js';
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onSettled,
  untrack,
  useContext,
} from 'solid-js';
import { type KeptJson, keptJson } from '../../browser/storage.ts';
import { TabStore } from '../../browser/storage-browser.ts';
import { type AskRecord, type Question, questionsOf, type Section } from '../../core/ask.ts';
import { Actor } from '../actor.tsx';
import { useAskRoot } from './root.tsx';
import {
  type AskPageActor,
  AskPageEvent,
  type AskPageState,
  Draft,
  type Page,
  pageSections,
  spawnAskPage,
} from './machine.ts';

/** Where the tab keeps ask `ask`'s draft, unsent. */
const keptDraftKey = (ask: string) => `film-review.ask-draft:${ask}`;

/** Where the page is: reading the ask, open on it, sending its answers, or unable to read it. */
type AskPhase = AskPageState['_tag'];

interface AskStateValue {
  /** The ask's id: what its part on the page is found by (`data-ask`). */
  readonly id: string;
  readonly phase: Accessor<AskPhase>;
  /** The ask as last read. */
  readonly record: Accessor<Option.Option<AskRecord>>;
  /** The page's sections, from where the run is as far as the draft reaches; none once it is not asking. */
  readonly sections: Accessor<ReadonlyArray<Section>>;
  /** The owner's answer `id` as drafted ('' when not). */
  readonly drafted: (id: string) => string;
  /** The questions the page waits on, in page order, and whether each is answered. */
  readonly questions: Accessor<ReadonlyArray<Question>>;
  /** What the last send or read said: why it was refused, or why the ask cannot be read. */
  readonly said: Accessor<string>;
  /** The question the last Send was refused for: the first left open ('' when none). */
  readonly missing: Accessor<string>;
}

interface AskActions {
  /** Set the owner's answer `id` to `value`. */
  readonly set: (id: string, value: string) => void;
  /** Send the page's answers. */
  readonly submit: () => void;
  /** Read the ask again, once it could not be read. */
  readonly retry: () => void;
}

interface AskContextValue {
  readonly state: AskStateValue;
  readonly actions: AskActions;
}

const AskContext = createContext<AskContextValue>();

/** The ask's context: only inside `<Ask.Provider>`. */
export const useAsk = (): AskContextValue => useContext(AskContext);

/** The page, once the ask is read: every state past the first read holds it. */
const pageOf = (s: AskPageState): Option.Option<Page> =>
  Match.value(s).pipe(
    Match.tag('Open', 'Sending', 'Rereading', 'Gone', (o) => Option.some(o.page)),
    Match.orElse(() => Option.none<Page>()),
  );

const draftOf = (s: AskPageState): Readonly<Record<string, string>> =>
  Option.match(pageOf(s), { onNone: () => ({}), onSome: (p) => p.draft });

const saidOf = (s: AskPageState): string =>
  Match.value(s).pipe(
    Match.tag('Open', 'Reading', 'Rereading', (o) => o.said),
    Match.tag('Unreadable', 'Gone', (u) => u.why),
    Match.orElse(() => ''),
  );

/**
 * The tab's kept draft of ask `ask`, for the page in `page`: once the page has
 * settled it is read and sent as `Restored` the first time the page is open,
 * and from then on each draft the page holds is written.
 */
const keepDraft = (
  ask: string,
  page: Accessor<AskPageState>,
  send: (event: AskPageEvent) => void,
) => {
  const [kept, setKept] = createSignal(Option.none<KeptJson<Draft>>(), { ownedWrite: true });
  onSettled(() => {
    setKept(Option.some(keptJson(TabStore, keptDraftKey(ask), Draft, () => ({}))));
  });
  let restored = false;
  createEffect(
    () => ({ store: kept(), state: page() }),
    ({ store, state }) => {
      if (Option.isNone(store)) return;
      if (restored) return store.value.set(draftOf(state));
      if (state._tag !== 'Open') return;
      restored = true;
      send(AskPageEvent.Restored({ draft: store.value.get() }));
    },
  );
};

/**
 * Where `record`'s run stands, in a word that changes with each answer the
 * lab keeps and its close: what tells the page an answer landed.
 */
const runOf = (record: Option.Option<AskRecord>): string =>
  Option.match(record, {
    onNone: () => '',
    onSome: (r) => `${r.state._tag}:${r.answered.length}`,
  });

const Body = (
  props: ParentProps<{
    readonly ask: string;
    readonly actor: AskPageActor;
    readonly moved: () => void;
  }>,
) => {
  const stateAtom = ActorAtom.make(props.actor);
  const page = useAtomValue(() => stateAtom);
  const send = useAtomSet(() => stateAtom);
  keepDraft(props.ask, page, send);
  const record = createMemo(() => Option.map(pageOf(page()), (p) => p.record));
  let run = Option.none<string>();
  createEffect(
    () => runOf(record()),
    (now) => {
      if (now === '') return;
      if (Option.isSome(run) && run.value !== now) props.moved();
      run = Option.some(now);
    },
  );
  const sections = createMemo(() =>
    Option.match(record(), {
      onNone: () => [],
      onSome: (r) => pageSections(r, draftOf(page())),
    }),
  );
  const value: AskContextValue = {
    state: {
      id: props.ask,
      phase: () => page()._tag,
      record,
      sections,
      drafted: (id) => Option.getOrElse(Record.get(draftOf(page()), id), () => ''),
      questions: createMemo(() => questionsOf(sections())),
      said: () => saidOf(page()),
      missing: () =>
        Match.value(page()).pipe(
          Match.tag('Open', (o) => o.missing),
          Match.orElse(() => ''),
        ),
    },
    actions: {
      set: (id, v) => send(AskPageEvent.Set({ id, value: v })),
      submit: () => send(AskPageEvent.Submit),
      retry: () => send(AskPageEvent.Retry),
    },
  };
  return <AskContext value={value}>{props.children}</AskContext>;
};

/**
 * Ask `ask`'s state and actions, for its part's parts. It opens on `first`,
 * the ask as its page's read had it (`askPage`), the one the shell names the
 * page by; `moved` hears each move of its run past it, so the page reads its
 * asks again.
 */
export const Provider = (
  props: ParentProps<{
    readonly ask: string;
    readonly first: Accessor<AskRecord>;
    readonly moved: () => void;
  }>,
) => {
  const { meta } = useAskRoot();
  return (
    <Actor
      runtime={meta.runtime}
      spawn={spawnAskPage(
        props.ask,
        Effect.sync(() => untrack(props.first)),
      )}
    >
      {(actor) => (
        <Body ask={props.ask} actor={actor} moved={props.moved}>
          {props.children}
        </Body>
      )}
    </Actor>
  );
};
