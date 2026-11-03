import { For, type JSX, Show } from '@solidjs/web';
import { Toggle } from '@manna/ui/toggle';
import { ToggleGroup } from '@manna/ui/toggle-group';
import { Array as Arr, Match, Option, Predicate, Record } from 'effect';
import { type Accessor, createEffect, createMemo, onSettled } from 'solid-js';
import {
  type AskAnswer,
  type AskBlock,
  type AskImage,
  type AskRecord,
  type Asking,
  type Section,
  askStatus,
  askedIn,
  blocksOf,
  endText,
  neededText,
  optionsShown,
  requiredOf,
  titleOf,
} from '../../core/ask.ts';
import type { Input } from '../../browser/keys.ts';
import { focusFor } from '../focus.ts';
import { pressed } from '../pressed.ts';
import { useAskRoot } from './root.tsx';
import { useAsk } from './context.tsx';
import { AudioPart, BoardPart, DocumentPart, ScriptPart, VideoPart } from './material.tsx';

export { Provider } from './context.tsx';

type BlockOf<K extends AskBlock['kind']> = Extract<AskBlock, { readonly kind: K }>;

const SETTLED = {
  answered: { text: 'answered', state: 'approved' },
  closed: { text: 'closed', state: 'stale' },
} as const;
type Settled = (typeof SETTLED)[keyof typeof SETTLED];

const HeadWith = (props: { readonly title: (text: string) => JSX.Element }) => {
  const { state } = useAsk();
  return (
    <Show when={Option.getOrUndefined(state.record())}>
      {(record: Accessor<AskRecord>) => {
        const settled = () =>
          Match.value(askStatus(record().state)).pipe(
            Match.when('asking', () => Option.none<Settled>()),
            Match.orElse((status) => Option.some<Settled>(SETTLED[status])),
          );
        return (
          <header class="ak-head">
            <div class="ak-head-row">
              {props.title(record().title)}
              <Show when={Option.getOrUndefined(settled())}>
                {(chip: Accessor<Settled>) => (
                  <span class="sh-badge" data-state={chip().state} data-role="status">
                    {chip().text}
                  </span>
                )}
              </Show>
            </div>
            <p class="ak-why">{record().why}</p>
            <Show when={record().deadline}>
              {(d: Accessor<string>) => (
                <p class="ak-by">by {d().slice(0, 16).replace('T', ' ')}</p>
              )}
            </Show>
          </header>
        );
      }}
    </Show>
  );
};

export const Head = () => <HeadWith title={(text) => <h1>{text}</h1>} />;

export const PartHead = () => <HeadWith title={(text) => <h2 class="ak-part-h">{text}</h2>} />;

const within = (ask: string): string => `.ak[data-ask="${CSS.escape(ask)}"]`;

const fieldOf = (ask: string, id: string): Option.Option<HTMLElement> =>
  Option.fromNullishOr(
    document.querySelector<HTMLElement>(`${within(ask)} [data-answer="${CSS.escape(id)}"]`),
  );

const ANSWERS_IN = 'button, textarea, input';
const HEAD_IN = '.ak-section-h';

const goTo = (el: HTMLElement, focus: string, input: Input) => {
  if (!el.matches('.ak-step'))
    Option.map(
      Option.fromNullishOr(el.closest('.ak-step')?.querySelector<HTMLElement>(HEAD_IN)),
      (head) => {
        el.style.scrollMarginTop = `calc(var(--header-h) + ${head.offsetHeight}px + var(--s-2))`;
      },
    );
  el.scrollIntoView({ block: 'start' });
  Option.map(Option.fromNullishOr(el.querySelector<HTMLElement>(focus)), (target) =>
    focusFor(target, input, { preventScroll: true }),
  );
};

const stepOf = (ask: string, name: string): Option.Option<HTMLElement> =>
  Option.fromNullishOr(
    document.querySelector<HTMLElement>(`${within(ask)} .ak-step[data-step="${CSS.escape(name)}"]`),
  );

const SectionTitle = (props: {
  readonly step: Section['step'];
  readonly n: number;
  readonly of: number;
}) => (
  <>
    <Show when={props.of > 1}>
      <span class="ak-count">
        {Option.match(titleOf(props.step), {
          onNone: () => `${props.n} of ${props.of}`,
          onSome: () => `${props.n} of ${props.of} · `,
        })}
      </span>
    </Show>
    {Option.getOrElse(titleOf(props.step), () => '')}
  </>
);

const headed = (step: Section['step'], of: number): boolean =>
  Option.isSome(titleOf(step)) || of > 1;

const indexTitle = (step: Section['step'], n: number): string =>
  Option.match(titleOf(step), {
    onNone: () => `${n}`,
    onSome: (title) => `${n} · ${title}`,
  });

export const Index = () => {
  const { state } = useAsk();
  const { meta } = useAskRoot();
  const names = createMemo(() => state.sections().map((s) => s.name));
  const titleOfStep = (name: string, n: number) =>
    Option.match(
      Arr.findFirst(state.sections(), (s) => s.name === name),
      { onNone: () => `${n}`, onSome: (s) => indexTitle(s.step, n) },
    );
  const openIn = (name: string) => state.questions().filter((q) => q.step === name && !q.answered);
  const asks = (name: string) => state.questions().some((q) => q.step === name);
  return (
    <Show when={names().length > 1}>
      <nav class="ak-index" aria-label="This ask's sections">
        <ol>
          <For each={names()}>
            {(name, i) => {
              const done = () => asks(name) && openIn(name).length === 0;
              return (
                <li>
                  <button
                    type="button"
                    class="sh-btn ak-index-go"
                    data-act="go-section"
                    data-step={name}
                    data-done={pressed(done())}
                    onClick={() =>
                      Option.map(stepOf(state.id, name), (el) =>
                        goTo(el, HEAD_IN, meta.hub.input()),
                      )
                    }
                  >
                    <span class="ak-index-title">{titleOfStep(name, i() + 1)}</span>
                    <Show when={done()}>
                      <span class="ak-index-done" aria-label="answered">
                        ✓
                      </span>
                    </Show>
                  </button>
                </li>
              );
            }}
          </For>
        </ol>
      </nav>
    </Show>
  );
};

const Img = (props: { readonly image: AskImage; readonly alt: string }) => (
  <figure class="ak-img">
    <img
      src={Option.getOrElse(Option.fromUndefinedOr(props.image.src), () => '')}
      alt={props.alt}
    />
    <Show when={props.image.caption}>
      {(caption: Accessor<string>) => <figcaption>{caption()}</figcaption>}
    </Show>
  </figure>
);

export const Heading = (props: { readonly block: BlockOf<'heading'> }) => (
  <h2 class="ak-h">{props.block.text}</h2>
);

export const Prose = (props: { readonly block: BlockOf<'prose'> }) => (
  <p class="ak-prose">{props.block.text}</p>
);

export const Picture = (props: { readonly block: BlockOf<'image'> }) => (
  <Img
    image={props.block.image}
    alt={Option.getOrElse(Option.fromUndefinedOr(props.block.image.caption), () => '')}
  />
);

export const ChooseOne = (props: { readonly block: BlockOf<'choose'> }) => {
  const { state, actions } = useAsk();
  const pictured = () => props.block.options.some((o) => Predicate.isNotUndefined(o.image));
  const missing = () => state.missing() === props.block.id;
  return (
    <fieldset
      class="ak-field"
      data-answer={props.block.id}
      data-invalid={pressed(missing())}
      aria-describedby={Option.getOrUndefined(
        Option.liftPredicate(saidId(state.id, props.block.id), () => missing()),
      )}
    >
      <legend>{props.block.label}</legend>
      <ToggleGroup<string>
        class="ak-options"
        data-pictured={pressed(pictured())}
        aria-label={props.block.label}
        value={Arr.filter([state.drafted(props.block.id)], (v) => v !== '')}
        onValueChange={(values) =>
          actions.set(
            props.block.id,
            Option.getOrElse(Arr.head(values), () => ''),
          )
        }
      >
        <For each={optionsShown(props.block.options)}>
          {(option) => (
            <Toggle<string>
              class="sh-btn ak-option"
              value={option.value}
              data-value={option.value}
              data-recommended={pressed(option.recommended === true)}
            >
              {Option.match(Option.fromUndefinedOr(option.image), {
                onNone: () => '',
                onSome: (image) => <Img image={image} alt={option.label} />,
              })}
              <span class="ak-label">
                {option.label}
                <Show when={option.recommended === true}>
                  {' '}
                  <span class="sh-badge" data-state="agent">
                    recommended
                  </span>
                </Show>
              </span>
            </Toggle>
          )}
        </For>
      </ToggleGroup>
      <For each={props.block.options.filter((o) => o.recommended === true)}>
        {(option) => (
          <Show when={option.why}>
            {(why: Accessor<string>) => <p class="ak-rec-why">Recommended: {why()}</p>}
          </Show>
        )}
      </For>
      <Unanswered block={props.block} />
    </fieldset>
  );
};

const saidId = (ask: string, id: string): string => `ak-said-${ask}-${id}`;

const Unanswered = (props: { readonly block: Asking }) => {
  const { state } = useAsk();
  return (
    <Show when={state.missing() === props.block.id}>
      <p class="ak-unanswered" id={saidId(state.id, props.block.id)}>
        {neededText(props.block)}
      </p>
    </Show>
  );
};

export const FreeText = (props: { readonly block: BlockOf<'free_text'> }) => {
  const { state, actions } = useAsk();
  const missing = () => state.missing() === props.block.id;
  return (
    <label class="ak-field" data-answer={props.block.id} data-invalid={pressed(missing())}>
      <span class="ak-legend">
        {props.block.label}
        <Show when={!requiredOf(props.block)}>
          <span class="ak-optional"> (optional)</span>
        </Show>
      </span>
      <textarea
        class="sh-field ak-text"
        name={props.block.id}
        rows={4}
        placeholder={Option.getOrElse(Option.fromUndefinedOr(props.block.placeholder), () => '')}
        value={state.drafted(props.block.id)}
        aria-invalid={pressed(missing())}
        aria-describedby={Option.getOrUndefined(
          Option.liftPredicate(saidId(state.id, props.block.id), () => missing()),
        )}
        onInput={(e) => actions.set(props.block.id, e.currentTarget.value)}
      />
      <Unanswered block={props.block} />
    </label>
  );
};

export const Block = (props: { readonly block: AskBlock }): JSX.Element =>
  Match.value(props.block).pipe(
    Match.discriminatorsExhaustive('kind')({
      heading: (b) => <Heading block={b} />,
      prose: (b) => <Prose block={b} />,
      image: (b) => <Picture block={b} />,
      choose: (b) => <ChooseOne block={b} />,
      free_text: (b) => <FreeText block={b} />,
      document: (b) => <DocumentPart block={b} />,
      script: (b) => <ScriptPart block={b} />,
      board: (b) => <BoardPart block={b} />,
      video: (b) => <VideoPart block={b} />,
      audio: (b) => <AudioPart block={b} />,
    }),
  );

export const Sections = () => {
  const { state } = useAsk();
  const names = createMemo(() => state.sections().map((s) => s.name));
  const stepNamed = (name: string) =>
    Arr.findFirst(state.sections(), (s) => s.name === name).pipe(Option.map((s) => s.step));
  return (
    <For each={names()}>
      {(name, i) => (
        <section class="ak-step" data-step={name}>
          <Show
            when={Option.getOrUndefined(
              Option.filter(stepNamed(name), (step) => headed(step, names().length)),
            )}
          >
            {(step: Accessor<Section['step']>) => (
              <h2 class="ak-section-h" tabindex="-1">
                <SectionTitle step={step()} n={i() + 1} of={names().length} />
              </h2>
            )}
          </Show>
          <For
            each={Option.match(stepNamed(name), {
              onNone: (): ReadonlyArray<AskBlock> => [],
              onSome: blocksOf,
            })}
          >
            {(block) => <Block block={block} />}
          </For>
        </section>
      )}
    </For>
  );
};

const answeredText = (questions: ReadonlyArray<{ readonly answered: boolean }>): string =>
  `${questions.filter((q) => q.answered).length} of ${questions.length} answered`;

export const Submit = () => {
  const { state, actions } = useAsk();
  const { meta } = useAskRoot();
  const sending = () => state.phase() === 'Sending' || state.phase() === 'Rereading';
  const shut = () => state.phase() !== 'Open';
  createEffect(
    () => state.missing(),
    (id) => {
      if (id !== '')
        Option.map(fieldOf(state.id, id), (el) => goTo(el, ANSWERS_IN, meta.hub.input()));
    },
  );
  return (
    <Show when={state.sections().length > 0}>
      <div class="sh-dock ak-send">
        <span class="rv-hint" data-role="answered" role="status" aria-live="polite">
          {Option.getOrElse(
            Option.liftPredicate(state.said(), (said) => said !== ''),
            () => answeredText(state.questions()),
          )}
        </span>
        <button
          type="button"
          class="sh-btn"
          data-primary
          data-act="send"
          disabled={shut()}
          aria-busy={pressed(sending())}
          onClick={() => actions.submit()}
        >
          Send
        </button>
      </div>
    </Show>
  );
};

const answerText = (answer: AskAnswer): string =>
  Match.value(answer).pipe(
    Match.discriminatorsExhaustive('kind')({
      choose: (a) => a.label,
      free_text: (a) => a.text,
      skipped: () => 'Skipped',
    }),
  );

const questionOf = (record: AskRecord, id: string): string =>
  Option.getOrElse(
    Arr.findFirst(Object.values(record.ask.steps).flatMap(askedIn), (b) => b.id === id).pipe(
      Option.map((b) => b.label),
    ),
    () => id,
  );

const Answers = (props: { readonly record: AskRecord }) => (
  <dl class="ak-answers">
    <For each={Record.toEntries(props.record.state.answers)}>
      {(entry) => (
        <div data-answer={entry[0]}>
          <dt>{questionOf(props.record, entry[0])}</dt>
          <dd>{answerText(entry[1])}</dd>
        </div>
      )}
    </For>
  </dl>
);

export const Outcome = () => {
  const { state } = useAsk();
  return (
    <Show
      when={Option.getOrUndefined(Option.filter(state.record(), (r) => r.state._tag !== 'Asking'))}
    >
      {(record: Accessor<AskRecord>) => (
        <section class="ak-outcome" data-outcome={record().state._tag}>
          <p>
            {Match.value(record().state).pipe(
              Match.tag('Answered', (s) =>
                Option.getOrElse(
                  Option.flatMap(Record.get(record().ask.steps, s.step), endText),
                  () => 'Answered. The agent has it.',
                ),
              ),
              Match.tag('Closed', (s) => `Closed: ${s.why}`),
              Match.orElse(() => ''),
            )}
          </p>
          <Answers record={record()} />
        </section>
      )}
    </Show>
  );
};

export const Status = () => {
  const { state, actions } = useAsk();
  return (
    <div class="ak-status">
      <p class="rv-hint" role="status" aria-live="polite">
        {Match.value(state.phase()).pipe(
          Match.when('Reading', () => 'Reading the ask…'),
          Match.when('Rereading', () => 'Reading the ask again…'),
          Match.when('Unreadable', () => `This ask cannot be read: ${state.said()}`),
          Match.when(
            'Gone',
            () => `This ask is gone from the lab: ${state.said()}. Your answers stay here to copy.`,
          ),
          Match.orElse(() => ''),
        )}
      </p>
      <Show when={state.phase() === 'Unreadable'}>
        <button type="button" class="sh-btn" data-act="retry" onClick={() => actions.retry()}>
          Read again
        </button>
      </Show>
    </div>
  );
};

const settledRecord = (record: Option.Option<AskRecord>): Option.Option<AskRecord> =>
  Option.filter(record, (r) => r.state._tag !== 'Asking');

export const WhileAsking = (props: { readonly children: JSX.Element }) => {
  const { state } = useAsk();
  return <Show when={Option.isNone(settledRecord(state.record()))}>{props.children}</Show>;
};

export const Folded = () => {
  const { state } = useAsk();
  return (
    <Show when={Option.getOrUndefined(settledRecord(state.record()))}>
      {(record: Accessor<AskRecord>) => {
        const chip = () =>
          Match.value(askStatus(record().state)).pipe(
            Match.when('closed', () => SETTLED.closed),
            Match.orElse(() => SETTLED.answered),
          );
        return (
          <details class="ak-folded">
            <summary class="ak-folded-line">
              <span class="ak-folded-title">{record().title}</span>
              <span class="sh-badge" data-state={chip().state} data-role="status">
                {chip().text}
              </span>
              <span class="ak-folded-answers">
                {Record.values(record().state.answers).map(answerText).join(' · ')}
              </span>
            </summary>
            <Outcome />
          </details>
        );
      }}
    </Show>
  );
};

const IN_VIEW = 2 / 3;

const startsInView = (part: HTMLElement) => {
  const top = part.getBoundingClientRect().top;
  return (
    top >= (Number.parseFloat(getComputedStyle(part).scrollMarginTop) || 0) - 1 &&
    top <= innerHeight * IN_VIEW
  );
};

export const TakeTo = () => {
  const { state } = useAsk();
  onSettled(() => {
    Option.map(
      Option.filter(
        Option.fromNullishOr(document.querySelector<HTMLElement>(within(state.id))),
        (part) => !startsInView(part),
      ),
      (part) => part.scrollIntoView({ block: 'start' }),
    );
  });
  return <></>;
};
