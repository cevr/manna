/* oxlint-disable effect/noNullish -- the wire shape is JSON (see ../server/api.ts); `null` is what an absent refcode or link arrives as. */
/* oxlint-disable effect/noTernary -- these are JSX render branches, not domain matches; `Match.value` in an attribute position reads worse and builds a matcher per render. */

import { useAtomValue, useRegistry } from '@manna/atom-solid';
import { parseHref } from '@manna/url-state';
import * as UrlAtom from '@manna/url-state/atom';
import { Array as Arr, Effect, Option } from 'effect';
import type { Accessor, Element } from 'solid-js';
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  For,
  isPending,
  latest,
  Loading,
  onCleanup,
  Show,
  untrack,
  useContext,
} from 'solid-js';

import {
  type BookSubtype,
  type BookType,
  type CorpusScope,
  type CorpusSection,
  EXAMPLE_QUERIES,
  PAGE_CONTEXT,
  SELECTABLE_SUBTYPES,
  type SearchResponse,
} from '../server/api.js';
import { contextSide } from './context-window.js';
import { trackRead, useScrollMemory } from './scroll.js';
import { remembered, runQuery, search, type ContextParagraph, type Hit } from './search.js';
import {
  EMPTY_PARAMS,
  hasFilters,
  MAX_PANES,
  type SearchParams,
  type Sign,
  signOf,
  toggle,
  toRequest,
  toWorkspaceString,
  Workspace as WorkspacePlace,
} from './url-state.js';

const workspace = UrlAtom.place(WorkspacePlace);

type Panes = Arr.NonEmptyReadonlyArray<SearchParams>;

interface WorkspaceState {
  readonly panes: Accessor<Option.Option<Panes>>;
  readonly update: (update: (panes: Panes) => Panes) => void;
}

const useWorkspace = (): WorkspaceState => {
  const registry = useRegistry();
  const place = useAtomValue(() => workspace);
  return {
    panes: () => Option.map(place(), (value) => value.query),
    update: (update) => {
      Option.map(registry.get(workspace), (current) =>
        registry.set(workspace, { ...current, query: update(current.query) }),
      );
    },
  };
};

const CONTEXT_SHOWN = 1;

const SECTIONS: readonly { readonly value: CorpusSection; readonly label: string }[] = [
  { value: 'egw-writings', label: 'EGW Writings' },
  { value: 'pioneer-library', label: 'Pioneers' },
  { value: 'reference', label: 'Reference' },
  { value: 'bible', label: 'Bible' },
];

const SCOPES: readonly { readonly value: CorpusScope; readonly label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'egw', label: 'Ellen White' },
  { value: 'pioneer', label: 'Pioneers' },
];

const TYPES: readonly { readonly value: BookType; readonly label: string }[] = [
  { value: 'book', label: 'Books' },
  { value: 'periodical', label: 'Periodicals' },
  { value: 'manuscript', label: 'Letters & MSS' },
  { value: 'bible', label: 'Bible' },
  { value: 'dictionary', label: 'Dictionaries' },
  { value: 'topicalindex', label: 'Topical index' },
  { value: 'scriptindex', label: 'Scripture index' },
];

const SUBTYPE_LABELS = {
  devotional: 'Devotionals',
  commentary: 'Commentaries',
  LtMs: 'Letters & MSS',
  ModernEnglish: 'Modern English',
} satisfies Record<BookSubtype, string>;

type Outcome =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Ready'; readonly response: SearchResponse }
  | { readonly _tag: 'Failed'; readonly message: string };

const IDLE: Outcome = { _tag: 'Idle' };

const hitsOf = (outcome: Outcome): readonly Hit[] =>
  outcome._tag === 'Ready' ? outcome.response.hits : [];

interface SearchStore {
  readonly draft: () => string;
  readonly setDraft: (value: string) => void;
  readonly params: () => SearchParams;
  readonly settled: () => Outcome;
  readonly pending: () => boolean;
  readonly search: (value: string) => void;
  readonly refine: (update: (current: SearchParams) => SearchParams) => void;
  readonly retry: () => void;
}

const SearchContext = createContext<SearchStore>();

const useSearch = (): SearchStore => useContext(SearchContext);

const SearchProvider = (props: { readonly pane: number; readonly children: Element }) => {
  const workspace = useWorkspace();

  const params = (): SearchParams =>
    Option.getOrElse(
      Option.flatMap(workspace.panes(), (panes) => Arr.get(panes, props.pane)),
      () => EMPTY_PARAMS,
    );

  const put = (update: (current: SearchParams) => SearchParams): void => {
    workspace.update((panes) =>
      Arr.map(panes, (existing, index) => (index === props.pane ? update(existing) : existing)),
    );
  };

  const [typed, setTyped] = createSignal(Option.none<string>());
  const committed = createMemo(() => params().q);
  createEffect(committed, () => {
    setTyped(Option.none());
  });

  const draft = (): string => Option.getOrElse(typed(), () => params().q);

  const requestKey = createMemo((): string => {
    const current = params();
    if (current.q.trim() === '') return '';
    return toWorkspaceString([current]);
  });

  const [mounted, setMounted] = createSignal(false);
  createEffect(
    () => undefined,
    () => {
      setMounted(true);
    },
  );

  const [attempt, setAttempt] = createSignal(0);

  const outcome = createMemo((): Outcome | Promise<Outcome> => {
    const ready = mounted();
    const key = requestKey();
    attempt();
    if (!ready || key === '') return IDLE;
    const request = toRequest(untrack(params), PAGE_CONTEXT);
    const known = remembered(request);
    if (Option.isSome(known)) return { _tag: 'Ready', response: known.value };
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    const read = search(request).pipe(
      Effect.match({
        onFailure: (error): Outcome => ({ _tag: 'Failed', message: error.message }),
        onSuccess: (response): Outcome => ({ _tag: 'Ready', response }),
      }),
    );
    return trackRead(runQuery(read, controller.signal));
  });

  const store: SearchStore = {
    draft,
    setDraft: (value) => {
      setTyped(Option.some(value));
    },
    params,
    settled: () => latest(outcome),
    pending: () => (!mounted() && requestKey() !== '') || isPending(() => outcome()),
    search: (value) => {
      put((current) => ({ ...current, q: value.trim() }));
    },
    refine: put,
    retry: () => setAttempt((count) => count + 1),
  };

  return <SearchContext value={store}>{props.children}</SearchContext>;
};

export const App = () => {
  useScrollMemory();
  const workspace = useWorkspace();
  return (
    <Show when={Option.isSome(workspace.panes())} fallback={<NotFound />}>
      <Workspace />
    </Show>
  );
};

const NotFound = () => {
  const href = useAtomValue(() => UrlAtom.href);
  const path = () => parseHref(href()).pathname;
  return (
    <div class="shell">
      <header class="masthead">
        <h1>EGW&nbsp;Search</h1>
      </header>
      <div class="status">
        <span>
          nothing at {path()} — <a href="/">search</a>
        </span>
      </div>
    </div>
  );
};

const Workspace = () => {
  const workspace = useWorkspace();
  const panes = (): readonly SearchParams[] =>
    Option.getOrElse(workspace.panes(), () => [EMPTY_PARAMS]);

  let claim: number | undefined;

  const addPane = (): void => {
    workspace.update((current) => {
      if (current.length >= MAX_PANES) return current;
      claim = current.length;
      return Arr.append(current, { ...Arr.lastNonEmpty(current), q: '' });
    });
  };

  const closePane = (index: number): void => {
    workspace.update((current) =>
      Arr.match(Arr.remove(current, index), {
        onEmpty: () => current,
        onNonEmpty: (rest) => rest,
      }),
    );
  };

  const takeCaret =
    (pane: number) =>
    (input: HTMLInputElement): void => {
      if (claim !== pane) return;
      claim = undefined;
      window.requestAnimationFrame(() => {
        input.focus({ preventScroll: true });
        input.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    };

  return (
    <div class="shell">
      <header class="masthead">
        <h1>EGW&nbsp;Search</h1>
        <Show when={panes().length < MAX_PANES}>
          <button type="button" class="addpane" onClick={addPane}>
            + pane
          </button>
        </Show>
      </header>

      <div class="panes" data-count={String(panes().length)}>
        <For each={panes()} keyed={false}>
          {(_params, index) => (
            <SearchProvider pane={index}>
              <section class="pane">
                <Show when={panes().length > 1}>
                  <button
                    type="button"
                    class="closepane"
                    aria-label={`Close pane ${String(index + 1)}`}
                    onClick={() => closePane(index)}
                  >
                    ✕
                  </button>
                </Show>
                <SearchBar ref={takeCaret(index)} />
                <Filters />
                <Results />
              </section>
            </SearchProvider>
          )}
        </For>
      </div>
    </div>
  );
};

const SearchBar = (props: { readonly ref: (input: HTMLInputElement) => void }) => {
  const search = useSearch();

  return (
    <form
      class="searchbar"
      onSubmit={(event) => {
        event.preventDefault();
        search.search(search.draft());
      }}
    >
      <input
        ref={props.ref}
        type="search"
        value={search.draft()}
        placeholder="search the writings…"
        autocomplete="off"
        autocapitalize="off"
        spellcheck={false}
        onInput={(event) => search.setDraft(event.currentTarget.value)}
      />
      <button type="submit" disabled={search.draft().trim() === ''}>
        Search
      </button>
    </form>
  );
};

const Chip = (props: {
  readonly label: string;
  readonly active: boolean;
  readonly onPick: () => void;
}) => (
  <button
    type="button"
    class={props.active ? 'chip on' : 'chip'}
    aria-pressed={props.active ? 'true' : 'false'}
    onClick={() => props.onPick()}
  >
    {props.label}
  </button>
);

const SignedChip = (props: {
  readonly label: string;
  readonly sign: Sign;
  readonly onPick: () => void;
}) => (
  <button
    type="button"
    class={props.sign === 'off' ? 'chip' : `chip ${props.sign}`}
    aria-pressed={props.sign === 'off' ? 'false' : 'true'}
    aria-label={props.sign === 'exclude' ? `${props.label}, excluded` : props.label}
    title={
      props.sign === 'exclude'
        ? `Excluding ${props.label} — click to clear`
        : props.sign === 'include'
          ? `Only ${props.label} — click to exclude`
          : `Click to require ${props.label}, twice to exclude`
    }
    onClick={() => props.onPick()}
  >
    <Show when={props.sign !== 'off'}>
      <span class="csign" aria-hidden="true">
        {props.sign === 'include' ? '✓' : '−'}
      </span>
    </Show>
    {props.label}
  </button>
);

const FilterRow = (props: { readonly label: string; readonly children: Element }) => (
  <div class="frow">
    <span class="flabel">{props.label}</span>
    <div class="fchips">{props.children}</div>
  </div>
);

const Filters = () => {
  const search = useSearch();
  const [open, setOpen] = createSignal(false);
  const active = (): boolean => hasFilters(search.params());

  return (
    <div class="filters">
      <div class="fhead">
        <button
          type="button"
          class="ftoggle"
          aria-expanded={open() ? 'true' : 'false'}
          onClick={() => setOpen(!open())}
        >
          {open() ? '− Filters' : '+ Filters'}
        </button>
        <Show when={active()}>
          <button
            type="button"
            class="fclear"
            onClick={() => search.refine((current) => ({ ...EMPTY_PARAMS, q: current.q }))}
          >
            clear
          </button>
        </Show>
      </div>

      <Show when={open()}>
        <div class="fbody">
          <FilterRow label="Library">
            <For each={SECTIONS}>
              {(entry) => (
                <SignedChip
                  label={entry.label}
                  sign={signOf(search.params().section, entry.value)}
                  onPick={() => search.refine((current) => toggle(current, 'section', entry.value))}
                />
              )}
            </For>
          </FilterRow>

          <FilterRow label="Author">
            <For each={SCOPES}>
              {(entry) => (
                <Chip
                  label={entry.label}
                  active={search.params().scope === entry.value}
                  onPick={() => search.refine((current) => ({ ...current, scope: entry.value }))}
                />
              )}
            </For>
          </FilterRow>

          <FilterRow label="Kind">
            <For each={TYPES}>
              {(entry) => (
                <SignedChip
                  label={entry.label}
                  sign={signOf(search.params().type, entry.value)}
                  onPick={() => search.refine((current) => toggle(current, 'type', entry.value))}
                />
              )}
            </For>
          </FilterRow>

          <FilterRow label="Form">
            <For each={SELECTABLE_SUBTYPES}>
              {(entry) => (
                <SignedChip
                  label={SUBTYPE_LABELS[entry]}
                  sign={signOf(search.params().subtype, entry)}
                  onPick={() => search.refine((current) => toggle(current, 'subtype', entry))}
                />
              )}
            </For>
          </FilterRow>

          <FilterRow label="Apparatus">
            <Chip
              label="Hide dictionaries & indexes"
              active={search.params().excludeApparatus}
              onPick={() =>
                search.refine((current) => ({
                  ...current,
                  excludeApparatus: !current.excludeApparatus,
                }))
              }
            />
          </FilterRow>
        </div>
      </Show>
    </div>
  );
};

const Results = () => {
  const search = useSearch();
  const rows = (): readonly Hit[] => hitsOf(search.settled());
  const failure = (): string | undefined => {
    const current = search.settled();
    return current._tag === 'Failed' ? current.message : undefined;
  };

  return (
    <Loading fallback={<Skeleton />}>
      <Status />
      <Show when={!search.pending() || rows().length > 0} fallback={<Skeleton />}>
        <Show
          when={failure()}
          fallback={
            <Show when={rows().length > 0} fallback={<Empty />}>
              <ul
                class={search.pending() ? 'results stale' : 'results'}
                aria-busy={search.pending() ? 'true' : 'false'}
              >
                {}
                <For each={rows()} keyed={false}>
                  {(hit) => <HitRow hit={hit()} />}
                </For>
              </ul>
            </Show>
          }
        >
          {(message) => (
            <div class="status">
              <span class="err">search failed — {message()}</span>
              <button type="button" onClick={() => search.retry()}>
                retry
              </button>
            </div>
          )}
        </Show>
      </Show>
    </Loading>
  );
};

const pluralResults = (count: number): string =>
  count === 1 ? '1 result' : `${String(count)} results`;

const Status = () => {
  const search = useSearch();

  const label = (): string => {
    const query = search.params().q;
    if (query === '') return 'awaiting query';
    if (search.pending()) return `searching “${query}”…`;
    const current = search.settled();
    if (current._tag === 'Failed') return `“${query}” — failed`;
    if (current._tag === 'Ready' && current.response.nonSelective) {
      return `“${query}” — too common to rank`;
    }
    return `“${query}” — ${pluralResults(hitsOf(current).length)}`;
  };

  return (
    <div class="status">
      <span>{label()}</span>
      <Show when={hasFilters(search.params())}>
        <span class="filtered">filtered</span>
      </Show>
    </div>
  );
};

const Empty = () => {
  const search = useSearch();
  const narrowed = (): boolean => search.params().q !== '' && hasFilters(search.params());
  const nonSelective = (): boolean => {
    const current = search.settled();
    return current._tag === 'Ready' && current.response.nonSelective;
  };

  return (
    <div class="empty">
      {}
      <Show when={!nonSelective()} fallback={<div>too common to rank</div>}>
        <div>{search.params().q === '' ? 'no query yet' : 'no matches'}</div>
      </Show>
      <Show when={nonSelective()}>
        <div class="hint">
          “{search.params().q}” appears in a large share of the corpus, so ranking it would not
          surface anything in particular. Add a word or two to narrow it.
        </div>
      </Show>
      {}
      <Show
        when={narrowed()}
        fallback={
          <div class="examples">
            <For each={EXAMPLE_QUERIES}>
              {(example) => (
                <button type="button" onClick={() => search.search(example)}>
                  {example}
                </button>
              )}
            </For>
          </div>
        }
      >
        <div class="examples">
          <button
            type="button"
            onClick={() => search.refine((current) => ({ ...EMPTY_PARAMS, q: current.q }))}
          >
            clear filters and search again
          </button>
        </div>
      </Show>
    </div>
  );
};

const SKELETON_ROWS: readonly (readonly string[])[] = [
  ['92%', '88%', '64%'],
  ['85%', '94%', '71%'],
  ['90%', '79%'],
  ['88%', '91%', '58%'],
];

const Skeleton = () => (
  <ul class="results" aria-busy="true">
    <For each={SKELETON_ROWS}>
      {(lines) => (
        <li class="hit skeleton">
          <div class="meta">
            <span class="sk sk-ref" />
            <span class="sk sk-book" />
          </div>
          <div class="body">
            <For each={lines}>{(width) => <span class="sk sk-line" style={{ width }} />}</For>
          </div>
        </li>
      )}
    </For>
  </ul>
);

const HitRow = (props: { readonly hit: Hit }) => {
  const [expandedHit, setExpandedHit] = createSignal<Hit | undefined>(undefined);
  const expanded = (): boolean => expandedHit() === props.hit;
  const expand = (): void => {
    setExpandedHit(props.hit);
  };
  const before = () => {
    const outward = [...props.hit.before].reverse();
    const side = contextSide(outward, expanded(), CONTEXT_SHOWN);
    return { shown: [...side.shown].reverse(), more: side.more };
  };
  const after = () => contextSide(props.hit.after, expanded(), CONTEXT_SHOWN);
  return (
    <li class="hit">
      <div class="meta">
        <Reference class="refcode" refcode={props.hit.refcode} url={props.hit.url} />
        <span class="book">{props.hit.bookTitle}</span>
        {}
        <Show when={props.hit.isHeading}>
          <span class="kind">Chapter</span>
        </Show>
        {}
        <Show when={props.hit.backMatter}>
          <span class="kind">Back matter</span>
        </Show>
      </div>
      <div class="body">
        <Show when={before().more > 0}>
          <button type="button" class="expand" onClick={expand}>
            Show more
          </button>
        </Show>
        <For each={before().shown}>{(para) => <Context para={para} />}</For>
        {}
        <div class={props.hit.isHeading ? 'match heading' : 'match'}>
          <p class="text">{props.hit.text}</p>
        </div>
        <For each={after().shown}>{(para) => <Context para={para} />}</For>
        <Show when={after().more > 0}>
          <button type="button" class="expand" onClick={expand}>
            Show more
          </button>
        </Show>
      </div>
    </li>
  );
};

const Reference = (props: {
  readonly class: string;
  readonly refcode: string | null;
  readonly url: string | null;
}) => (
  <Show when={props.refcode}>
    {(refcode) => (
      <Show when={props.url} fallback={<span class={props.class}>{refcode()}</span>}>
        {(href) => (
          <a class={props.class} href={href()} target="_blank" rel="noopener noreferrer">
            {refcode()}
          </a>
        )}
      </Show>
    )}
  </Show>
);

const Context = (props: { readonly para: ContextParagraph }) => (
  <p class={props.para.isHeading ? 'context heading' : 'context'}>
    {props.para.text}
    <Reference class="cref" refcode={props.para.refcode} url={props.para.url} />
  </p>
);
