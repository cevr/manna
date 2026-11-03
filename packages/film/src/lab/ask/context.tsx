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

const keptDraftKey = (ask: string) => `film-review.ask-draft:${ask}`;

type AskPhase = AskPageState['_tag'];

interface AskStateValue {
  readonly id: string;
  readonly phase: Accessor<AskPhase>;
  readonly record: Accessor<Option.Option<AskRecord>>;
  readonly sections: Accessor<ReadonlyArray<Section>>;
  readonly drafted: (id: string) => string;
  readonly questions: Accessor<ReadonlyArray<Question>>;
  readonly said: Accessor<string>;
  readonly missing: Accessor<string>;
}

interface AskActions {
  readonly set: (id: string, value: string) => void;
  readonly submit: () => void;
  readonly retry: () => void;
}

interface AskContextValue {
  readonly state: AskStateValue;
  readonly actions: AskActions;
}

const AskContext = createContext<AskContextValue>();

export const useAsk = (): AskContextValue => useContext(AskContext);

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
