import { For, type JSX, Show } from '@solidjs/web';
import { Array as Arr, Effect, Option, Result } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type { Accessor } from 'solid-js';
import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { Frames } from '../../browser/frames.ts';
import { Selection } from '../../command/selection.ts';
import { targetAttr } from '../../command/target.ts';
import type { Host } from '../../browser/host.ts';
import type { Hub } from '../../command/hub.ts';
import type { DraftBeatRead, MarksPost, ScriptVoice } from '../../core/api.ts';
import type { NoteWords } from '../../core/schema.ts';
import type { Mark } from '../../core/delivery.ts';
import { parse } from '../../core/narration.ts';
import type { LabFailure } from '../api.ts';
import { Target } from '../command/context-menu.tsx';
import { type FollowClock, type Following, createFollowing, useFollow } from '../follow.ts';
import { FollowButton } from '../follow-button.tsx';
import { pressed } from '../pressed.ts';
import { BriefBox } from '../script/brief.tsx';
import { scriptCommands } from '../script/commands.ts';
import { gapBefore } from '../script/delivery.ts';
import { VoiceOver, type VoiceSource, polled, useVoice } from '../script/voice.tsx';
import {
  Delivery,
  GapGlyph,
  HearWords,
  HearIt,
  Spend,
  TakeState,
  type Words,
  stressAttr,
} from '../script/voiced.tsx';
import { type Row, type SectionRows, type WordAt, rangesOf, rowOf } from '../transcript/lit.ts';
import { lineRows } from './line.ts';
import { usePainted, wordsReleased } from '../transcript/words.ts';
import type { AskApi } from '../ask/api.ts';

export const READER_CSS = `
.rd-label { color: var(--text-2); }
/* A head keeps the height of its ▶ before a take lands, so the page does not shift as takes arrive. */
.rd .lab-script-beat-head { min-height: var(--hit); }
/* A cue's name in a brief, set apart from its prose; sources in the brief's ink, not the head's quieter one. */
.rd .lab-script-code { font: inherit; color: var(--text-1); }
.rd .lab-script-cite { color: var(--text-2); }
/* The script's one labelled press for its sound, at its head, the pointer's size. */
.rd-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); padding: var(--s-2) var(--gutter) 0; }
.rd-head .lab-script-spend { padding: 0; }
.lab-script-hear-all { min-height: var(--hit); }
/* A play the browser refused its sound: said beside the press, in the warning's ink (a live region always there, its words alone changing). */
.lab-script-blocked { color: var(--state-warning); font-size: var(--fs-2); }
::highlight(lab-live) { background-color: color-mix(in srgb, var(--state-live) 26%, transparent); color: var(--text-1); }
::highlight(lab-picked) { background-color: var(--accent-wash); color: var(--text-1); text-decoration: underline var(--accent); }
/* The beat at the page's playhead: a rule down its edge, never a fill, so the words keep their ink. */
.rd .lab-script-beat[data-live="true"] { box-shadow: inset 2px 0 0 var(--state-live); }
/* A brief behind its disclosure: one quiet line until asked. */
.rd-brief { margin: 0 0 var(--s-2); color: var(--text-2); }
.rd-brief > summary { min-height: var(--hit); display: flex; align-items: center; cursor: pointer; }
.rd-head > .lab-follow { min-height: var(--hit); }
`;

interface ReadBeat {
  readonly read: DraftBeatRead;
  readonly line: Option.Option<SectionRows>;
  readonly marks: ReadonlyArray<Mark>;
}

const laidOut = (beats: ReadonlyArray<DraftBeatRead>): ReadonlyArray<ReadBeat> => {
  let at = 0;
  return beats.map((read): ReadBeat => {
    const parsed = Option.flatMap(Option.fromUndefinedOr(read.say), (say) =>
      Result.getSuccess(parse(read.id, say)),
    );
    const line = Option.map(
      Option.filter(parsed, (p) => p.spoken !== ''),
      (p): SectionRows => {
        const rows = lineRows(read.id, p, at);
        at += p.spoken.length + 1;
        return rows;
      },
    );
    return {
      read,
      line,
      marks: Option.getOrElse(
        Option.map(parsed, (p) => p.delivery),
        () => [],
      ),
    };
  });
};

const wordsText = (rows: ReadonlyArray<Row>, w: Words): string =>
  rows
    .filter((r) => r.index >= w.from && r.index <= w.to)
    .map((r) => r.text)
    .join(' ');

const quoted = (rows: ReadonlyArray<Row>, w: Words): string => `“${wordsText(rows, w)}”`;

const Line = (props: {
  readonly line: SectionRows;
  readonly marks: ReadonlyArray<Mark>;
  readonly released: (event: MouseEvent) => void;
}) => {
  const voice = useVoice();
  const marks = () => voice.marksOf(props.line.id, props.marks);
  return (
    <Target
      of={Selection.cases.Words.make({
        scene: props.line.id,
        from: Option.getOrElse(
          Option.map(Arr.head(props.line.rows), (r) => r.index),
          () => 0,
        ),
        to: Option.getOrElse(
          Option.map(Arr.last(props.line.rows), (r) => r.index),
          () => 0,
        ),
      })}
      class="lab-script-line"
      data-scene={props.line.id}
      onClick={props.released}
    >
      <For each={props.line.rows}>
        {(row) => (
          <>
            <GapGlyph gap={gapBefore(marks(), row.index)} />
            <span
              class="lab-script-w"
              data-target={targetAttr(
                Selection.cases.Words.make({
                  scene: props.line.id,
                  from: row.index,
                  to: row.index,
                }),
              )}
              data-index={row.index}
              data-from={row.from}
              data-stress={stressAttr(marks(), row.index)}
            >
              {row.text}
            </span>{' '}
          </>
        )}
      </For>
    </Target>
  );
};

const Selected = (props: {
  readonly beat: ReadBeat;
  readonly words: Option.Option<Words>;
  readonly clear: () => void;
  readonly noting: Noting;
}) => (
  <Show
    when={Option.getOrUndefined(
      Option.zipWith(props.beat.line, props.words, (line, w) => ({ line, w })),
    )}
  >
    {(s) => (
      <section class="lab-script-ties" aria-label="The words selected">
        <header class="lab-script-ties-head">
          <span class="lab-script-ties-what lab-clamp">{quoted(s().line.rows, s().w)}</span>
          <HearWords beat={props.beat.read.id} words={props.words} />
          <button
            type="button"
            class="sh-btn"
            data-act="clear-draft"
            title="Select nothing"
            onClick={() => props.clear()}
          >
            Clear
          </button>
        </header>
        <Delivery
          beat={props.beat.read.id}
          marks={props.beat.marks}
          spoken={s()
            .line.rows.map((r) => r.text)
            .join(' ')}
          selected={props.words}
        />
        <Show
          when={Option.getOrUndefined(
            Option.map(props.noting, (note) => ({
              note,
              words: {
                beat: props.beat.read.id,
                from: s().w.from,
                to: s().w.to,
                text: wordsText(s().line.rows, s().w),
              },
            })),
          )}
          keyed
        >
          {(noted: {
            readonly note: (words: NoteWords) => JSX.Element;
            readonly words: NoteWords;
          }) => noted.note(noted.words)}
        </Show>
      </section>
    )}
  </Show>
);

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`)/;

const piece = (text: string) => {
  if (text.startsWith('**') && text.endsWith('**') && text.length > 4) {
    return <strong>{text.slice(2, -2)}</strong>;
  }
  if (text.startsWith('`') && text.endsWith('`') && text.length > 2) {
    return <code class="lab-script-code">{text.slice(1, -1)}</code>;
  }
  return text;
};

const Inline = (props: { readonly text: string }) => <>{props.text.split(INLINE).map(piece)}</>;

export type BriefShown = 'boxed' | 'disclosed';

const Brief = (props: { readonly shown: BriefShown; readonly children: JSX.Element }) => (
  <Show when={props.shown === 'disclosed'} fallback={<BriefBox>{props.children}</BriefBox>}>
    <details class="rd-brief">
      <summary>Picture</summary>
      <p class="lab-script-picture">{props.children}</p>
    </details>
  </Show>
);

const Beat = (props: {
  readonly beat: ReadBeat;
  readonly words: Option.Option<Words>;
  readonly released: (event: MouseEvent) => void;
  readonly clear: () => void;
  readonly live: boolean;
  readonly brief: BriefShown;
  readonly noting: Noting;
}) => (
  <section
    class="lab-script-beat"
    data-beat={props.beat.read.id}
    data-live={pressed(props.live)}
    aria-label={props.beat.read.id}
  >
    <header class="lab-script-beat-head">
      <span>{props.beat.read.id}</span>
      <Show when={props.beat.read.label !== ''}>
        <span class="rd-label">{props.beat.read.label}</span>
      </Show>
      <TakeState beat={props.beat.read.id} />
    </header>
    <Show when={props.beat.read.brief}>
      {(brief) => (
        <Brief shown={props.brief}>
          <Inline text={brief()} />
        </Brief>
      )}
    </Show>
    {Option.toArray(props.beat.line).map((line) => (
      <Line line={line} marks={props.beat.marks} released={props.released} />
    ))}
    <Selected beat={props.beat} words={props.words} clear={props.clear} noting={props.noting} />
    <Show when={props.beat.read.cite.length > 0}>
      <ul class="lab-script-cite" aria-label="Sources">
        <For each={props.beat.read.cite}>
          {(source) => (
            <li>
              <Inline text={source} />
            </li>
          )}
        </For>
      </ul>
    </Show>
  </section>
);

export const STATUS_ROLE = { true: 'alert', false: 'status' } as const;

interface WordsAt extends Words {
  readonly beat: string;
}

export interface Selecting {
  readonly selected: Accessor<Option.Option<WordsAt>>;
  readonly select: (beat: string, words: Words) => void;
  readonly clear: () => void;
}

export const useOwnSelecting = (): Selecting => {
  const [selected, setSelected] = createSignal(Option.none<WordsAt>());
  return {
    selected,
    select: (beat, w) => setSelected(Option.some({ beat, from: w.from, to: w.to })),
    clear: () => setSelected(Option.none()),
  };
};

interface Playhead {
  readonly beat: Accessor<Option.Option<string>>;
  readonly clock: FollowClock;
  readonly box: () => Option.Option<HTMLElement>;
  readonly clearTop: () => number;
  readonly pause: () => void;
}

type Noting = Option.Option<(words: NoteWords) => JSX.Element>;

export interface ReaderPage {
  readonly host: Host;
  readonly hub: Hub;
  readonly runtime: Atom.AtomRuntime<AskApi, never>;
  readonly playhead: Option.Option<Playhead>;
  readonly noting: Noting;
}

const Beats = (props: {
  readonly page: ReaderPage;
  readonly beats: Accessor<ReadonlyArray<ReadBeat>>;
  readonly selecting: Selecting;
  readonly following: Following;
  readonly brief: BriefShown;
}) => {
  const meta = props.page;
  const voice = useVoice();
  const lines = createMemo(() => props.beats().flatMap((b) => Option.toArray(b.line)));
  const selected = createMemo(() =>
    Option.map(props.selecting.selected(), (w): WordAt & Words => ({
      section: w.beat,
      index: w.from,
      from: w.from,
      to: w.to,
    })),
  );
  const released = wordsReleased({
    sections: lines,
    selectRange: (beat, from, to) => props.selecting.select(beat, { from, to }),
    tap: (beat, row, extend) =>
      props.selecting.select(
        beat,
        Option.getOrElse(
          Option.map(
            Option.filter(selected(), (w) => extend && w.section === beat),
            (w) => ({ from: Math.min(w.from, row.index), to: Math.max(w.from, row.index) }),
          ),
          () => ({ from: row.index, to: row.index }),
        ),
      ),
  });
  onCleanup(
    meta.hub.commands.register(
      ...scriptCommands({
        selection: () =>
          Option.map(props.selecting.selected(), (w) =>
            Selection.cases.Words.make({ scene: w.beat, from: w.from, to: w.to }),
          ),
        select: (w) => props.selecting.select(w.scene, { from: w.from, to: w.to }),
      }),
    ),
  );
  let page = Option.none<HTMLElement>();
  usePainted(
    meta.host,
    () => page,
    () => ({
      'lab-live': rangesOf(Option.toArray(Option.flatMap(voice.heard(), (w) => rowOf(lines(), w)))),
      'lab-picked': rangesOf(
        Option.getOrElse(
          Option.flatMap(selected(), (w) =>
            Option.map(
              Arr.findFirst(lines(), (l) => l.id === w.section),
              (l) => l.rows.filter((r) => r.index >= w.from && r.index <= w.to),
            ),
          ),
          (): ReadonlyArray<Row> => [],
        ),
      ),
    }),
  );
  createEffect(
    () => Option.map(selected(), (w) => `${w.section}:${w.from}-${w.to}`),
    (key) => {
      const stop = Option.map(
        Option.flatMap(
          Option.flatMap(key, () => page),
          (el) => Option.fromNullishOr(el.querySelector('.lab-script-ties')),
        ),
        (box) =>
          Effect.runCallbackWith(meta.host)(
            Effect.promise(() => document.fonts.ready).pipe(
              Effect.andThen(Frames.use((f) => f.next)),
              Effect.andThen(Effect.sync(() => box.scrollIntoView({ block: 'nearest' }))),
            ),
          ),
      );
      return () => {
        Option.map(stop, (interrupt) => interrupt());
      };
    },
  );
  const wordsOf = (beat: string): Option.Option<Words> =>
    Option.map(
      Option.filter(selected(), (w) => w.section === beat),
      (w) => ({ from: w.from, to: w.to }),
    );
  const live = () =>
    Option.getOrElse(
      Option.flatMap(meta.playhead, (p) => p.beat()),
      () => '',
    );
  Option.map(meta.playhead, (playhead) =>
    useFollow(
      {
        box: playhead.box,
        content: () => page,
        target: live,
        span: (beat) =>
          Option.map(
            Option.flatMap(page, (root) =>
              Option.fromNullishOr(
                root.querySelector<HTMLElement>(
                  `.lab-script-beat[data-beat="${CSS.escape(beat)}"]`,
                ),
              ),
            ),
            (section) => ({ first: section, last: section }),
          ),
        clear: () => ({ top: playhead.clearTop(), bottom: 0 }),
        following: props.following,
      },
      playhead.clock,
    ),
  );
  return (
    <div
      class="rd"
      ref={(el: HTMLElement) => {
        page = Option.some(el);
      }}
    >
      <For each={props.beats()} keyed={(b) => b.read.id}>
        {(beat) => (
          <Beat
            beat={beat()}
            words={wordsOf(beat().read.id)}
            released={released}
            clear={() => props.selecting.clear()}
            live={beat().read.id === live()}
            brief={props.brief}
            noting={meta.noting}
          />
        )}
      </For>
    </div>
  );
};

interface ScriptSource {
  readonly voice: Effect.Effect<ScriptVoice, LabFailure, AskApi>;
  readonly mark: (post: MarksPost) => Effect.Effect<unknown, LabFailure, AskApi>;
  readonly takeUrl: (file: string) => string;
  readonly written: string;
  readonly reread: () => void;
}

export const ScriptReader = (props: {
  readonly page: ReaderPage;
  readonly beats: Accessor<ReadonlyArray<DraftBeatRead>>;
  readonly source: ScriptSource;
  readonly selecting: Selecting;
  readonly cost: boolean;
  readonly brief?: BriefShown;
}) => {
  const meta = props.page;
  const beats = createMemo(() => laidOut(props.beats()));
  const following = createFollowing();
  const voice: VoiceSource = {
    reading: meta.runtime
      .atom(polled(props.source.voice))
      .pipe(Atom.withServerValue(() => AsyncResult.initial())),
    write: meta.runtime.fn((post: MarksPost) => Effect.suspend(() => props.source.mark(post))),
    takeUrl: (file) => props.source.takeUrl(file),
    beats: () => beats().map((b) => b.read.id),
    host: meta.host,
    player: Option.map(meta.playhead, (p) => ({ pause: p.pause, playing: p.clock.playing })),
    written: props.source.written,
    reread: Option.some(() => props.source.reread()),
  };
  return (
    <VoiceOver source={voice}>
      <div class="rd-head">
        <HearIt beats={beats().map((b) => b.read.id)} />
        <Show when={Option.isSome(meta.playhead)}>
          <FollowButton following={following} />
        </Show>
        <Spend cost={props.cost} />
      </div>
      <Beats
        page={meta}
        beats={beats}
        selecting={props.selecting}
        following={following}
        brief={props.brief ?? 'boxed'}
      />
    </VoiceOver>
  );
};
