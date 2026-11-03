import { useAtomValue } from '@manna/atom-solid';
import { Dialog } from '@manna/ui/dialog';
import * as UrlAtom from '@manna/url-state/atom';
import { For, type JSX, Show } from '@solidjs/web';
import { Array as Arr, Boolean as Bool, Match, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import {
  type Accessor,
  type ParentProps,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  untrack,
} from 'solid-js';
import { type AskBlock, scriptSource } from '../../core/ask.ts';
import { type ScriptBeats, boardFileUrl, reviewFrameUrl } from '../../core/api.ts';
import { type BoardFile, type Panel, panelsOf, shownTry } from '../../core/board.ts';
import { type ReviewFile, type ReviewVideo, docAt, videoAt } from '../../core/review.ts';
import type { PhoneCopy } from '../../core/served.ts';
import { addressOn } from '../../browser/host.ts';
import { useSheetDismissal } from '../sheet.tsx';
import { escapeHtml, markdownHtml } from './markdown.ts';
import { stillIn, withStill } from './place.ts';
import { PANEL_THUMB_CSS, PanelFigure, PanelThumb } from '../board/figure.tsx';
import { lineWords, panelWords } from '../board/words.ts';
import { PlaceStyle } from '../place-style.tsx';
import { WIDE } from '../viewport.ts';
import { pressed } from '../pressed.ts';
import { SCRIPT_READ_CSS } from '../script/style.ts';
import { type LabFailure, reasonOf } from '../api.ts';
import { AskApi } from './api.ts';
import { useAskRoot } from './root.tsx';
import { DraftReader, useDraftTitles } from './draft.tsx';
import { FilmScriptReader } from '../words/film-script.tsx';
import { takeHeard } from '../take.ts';
import { POSTER_W, failedText, sizeText, videoSource } from './format.ts';
import { PlayedAlone } from './player.tsx';
import { READER_CSS, type Selecting, useOwnSelecting } from '../words/reader.tsx';

type BlockOf<K extends AskBlock['kind']> = Extract<AskBlock, { readonly kind: K }>;

const MATERIAL_CSS = `
.ak-mat{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s-2);min-width:0;margin:0}
.ak-mat-cap{margin:0;color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2)}
.ak-mat-status{margin:0;color:var(--text-2)}
.ak-mat-status[data-failed=true]{color:var(--state-warning)}
.ak-mat-name{margin:0;color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2)}
.ak-doc{display:grid;min-width:0;background:var(--surface-1);
  scroll-margin-top:calc(var(--header-h) + var(--hit) + var(--s-4))}
.ak-doc:has(.ak-read-all){padding-bottom:var(--s-3)}
.ak-clamp{min-width:0}
.ak-clamp[data-open=false]{max-height:calc(12 * var(--lh-3));overflow:hidden}
.ak-clamp[data-open=false][data-long=true]{mask-image:linear-gradient(to bottom,var(--surface-0) 70%,transparent)}
.ak-read-all{justify-self:start;min-height:var(--hit);margin-inline:var(--s-4)}
`;

const BOARD_MAT_CSS = `
.ak-board{display:grid;gap:var(--s-3)}
.ak-board-beat{display:grid;gap:var(--s-1)}
.ak-board-id{margin:0;color:var(--text-2);font-size:var(--fs-2);line-height:var(--lh-2);font-weight:var(--w-2)}
.ak-board-panels{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(160px,100%),1fr));gap:var(--s-2)}
.ak-board-panel{display:flex;flex-direction:column;gap:var(--s-1);margin:0;min-width:0;padding:var(--s-1);
  border:var(--border);border-radius:var(--r-2);background:var(--surface-2)}
.ak-board-panel .rv-zoom img{border-radius:var(--r-1)}
@media ${WIDE}{.ak-board-panels{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}}
`;

const AUDIO_CSS = `
.ak-audio{display:block;width:100%;min-height:var(--hit)}
.ak-heard{margin:0;color:var(--text-1)}
`;

const Framed = (props: {
  readonly kind: AskBlock['kind'];
  readonly css: string;
  readonly caption: Option.Option<string>;
  readonly children: JSX.Element;
}) => (
  <figure class="ak-mat" data-material={props.kind}>
    <PlaceStyle
      css={`
        ${MATERIAL_CSS} ${props.css}
      `}
    />
    {props.children}
    <Show when={Option.getOrUndefined(props.caption)}>
      {(caption: Accessor<string>) => <figcaption class="ak-mat-cap">{caption()}</figcaption>}
    </Show>
  </figure>
);

const Missing = (props: {
  readonly read: AsyncResult.AsyncResult<unknown, LabFailure>;
  readonly what: string;
  readonly gone: string;
}) => (
  <p class="ak-mat-status" role="status" data-failed={pressed(!AsyncResult.isInitial(props.read))}>
    {AsyncResult.match(props.read, {
      onInitial: () => `Reading ${props.what}…`,
      onFailure: (f) => `Could not read ${props.what}: ${reasonOf(f.cause)}`,
      onSuccess: () => props.gone,
    })}
  </p>
);

const Clamped = (props: ParentProps) => {
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  const [long, setLong] = createSignal(false, { ownedWrite: true });
  let outer = Option.none<HTMLElement>();
  let words = Option.none<HTMLElement>();
  createEffect(
    () => true,
    () =>
      Option.match(words, {
        onNone: () => () => {},
        onSome: (inner) => {
          const observer = new ResizeObserver(() =>
            setLong(Option.exists(outer, (o) => inner.offsetHeight > o.clientHeight + 1)),
          );
          observer.observe(inner);
          return () => observer.disconnect();
        },
      }),
  );
  const measure = (inner: HTMLElement) => {
    words = Option.some(inner);
  };
  const id = createUniqueId();
  let panel = Option.none<HTMLElement>();
  const toggle = () => {
    const shutting = untrack(open);
    setOpen(!shutting);
    if (shutting)
      Option.map(
        Option.filter(
          panel,
          (p) =>
            p.getBoundingClientRect().top < Number.parseFloat(getComputedStyle(p).scrollMarginTop),
        ),
        (p) => p.scrollIntoView({ block: 'start' }),
      );
  };
  return (
    <div
      class="ak-doc"
      ref={(el: HTMLElement) => {
        panel = Option.some(el);
      }}
    >
      <div
        class="ak-clamp"
        id={id}
        data-open={pressed(open())}
        data-long={pressed(long())}
        ref={(el: HTMLElement) => {
          outer = Option.some(el);
        }}
      >
        <div ref={measure}>{props.children}</div>
      </div>
      <Show when={long()}>
        <button
          type="button"
          class="sh-btn ak-read-all"
          data-act="read-all"
          aria-expanded={pressed(open())}
          aria-controls={id}
          onClick={toggle}
        >
          {Bool.match(open(), { onTrue: () => 'Show less', onFalse: () => 'Read all' })}
        </button>
      </Show>
    </div>
  );
};

export const DocumentPart = (props: { readonly block: BlockOf<'document'> }) => {
  const { state } = useAskRoot();
  const file = createMemo(() =>
    Option.flatMap(AsyncResult.value(state.index()), (index) => docAt(index, props.block.ref)),
  );
  return (
    <Framed kind="document" css="" caption={Option.fromUndefinedOr(props.block.caption)}>
      <Show
        when={Option.getOrUndefined(file())}
        keyed
        fallback={
          <Missing
            read={state.index()}
            what={props.block.ref}
            gone={`${props.block.ref} is no longer in the review`}
          />
        }
      >
        {(f) => (
          <Clamped>
            <Markdown file={f} />
          </Clamped>
        )}
      </Show>
    </Framed>
  );
};

const DraftScript = (props: {
  readonly series: string;
  readonly draft: string;
  readonly only: Option.Option<ReadonlyArray<string>>;
  readonly selecting: Selecting;
}) => {
  const titles = useDraftTitles(props.series, props.draft);
  return (
    <>
      <p class="ak-mat-name" data-role="script-name">
        {titles.series()} · {titles.draft()}
      </p>
      <DraftReader
        series={props.series}
        draft={props.draft}
        only={props.only}
        selecting={props.selecting}
        cost={false}
      />
    </>
  );
};

export const ScriptPart = (props: { readonly block: BlockOf<'script'> }) => {
  const { meta } = useAskRoot();
  const selecting = useOwnSelecting();
  const only = Option.fromUndefinedOr(props.block.beats);
  const source = untrack(() => scriptSource(props.block));
  return (
    <Framed
      kind="script"
      css={`
        ${SCRIPT_READ_CSS} ${READER_CSS}
      `}
      caption={Option.none()}
    >
      {Match.value(source).pipe(
        Match.tagsExhaustive({
          Film: (s) => (
            <>
              <p class="ak-mat-name" data-role="script-name">
                The script of {s.film}
              </p>
              <FilmScriptReader
                page={{
                  host: meta.host,
                  hub: meta.hub,
                  runtime: meta.runtime,
                  playhead: Option.none(),
                  noting: Option.none(),
                }}
                script={meta.script(s.film)}
                film={s.film}
                only={only}
                selecting={selecting}
              />
            </>
          ),
          Draft: (s) => (
            <DraftScript series={s.series} draft={s.draft} only={only} selecting={selecting} />
          ),
        }),
      )}
    </Framed>
  );
};

interface PanelShown {
  readonly panel: Panel;
  readonly words: string;
}

interface BeatShown {
  readonly beat: string;
  readonly panels: ReadonlyArray<PanelShown>;
}

const panelsShown = (
  board: BoardFile,
  block: BlockOf<'board'>,
  script: Option.Option<ScriptBeats>,
): ReadonlyArray<BeatShown> => {
  const named = Option.fromUndefinedOr(block.panels);
  const shown = board.panels.filter((p) =>
    Option.match(named, { onNone: () => true, onSome: (ids) => ids.includes(p.id) }),
  );
  const lineOf = (beat: string) =>
    Option.getOrElse(
      Option.flatMap(script, (s) =>
        Option.map(
          Option.flatMap(
            Arr.findFirst(s.beats, (b) => b.id === beat),
            (b) => Option.fromUndefinedOr(b.say),
          ),
          (say) => lineWords(beat, say),
        ),
      ),
      () => [],
    );
  return Arr.dedupe(shown.map((p) => p.beat)).map((beat): BeatShown => {
    const all = panelsOf(board, beat);
    const line = lineOf(beat);
    return {
      beat,
      panels: shown
        .filter((p) => p.beat === beat)
        .map((panel): PanelShown => {
          const at = all.findIndex((p) => p.id === panel.id);
          const until = Option.map(Arr.get(all, at + 1), (next) => next.at);
          return { panel, words: panelWords(line, panel.at, until) };
        }),
    };
  });
};

const AskPanelThumb = (props: { readonly film: string; readonly panel: Panel }) => {
  const src = () => Option.map(shownTry(props.panel), (t) => boardFileUrl(props.film, t.file));
  const still = () => Option.filter(src(), () => !props.panel.text);
  return (
    <Show
      when={Option.getOrUndefined(still())}
      fallback={<PanelThumb panel={props.panel} src={src()} />}
    >
      {(at: Accessor<string>) => (
        <Zoom
          still={at()}
          alt=""
          name={`board-${props.panel.id}`}
          shown={{ src: at(), caption: `${props.panel.beat} · ${props.panel.at}` }}
        />
      )}
    </Show>
  );
};

export const BoardPart = (props: { readonly block: BlockOf<'board'> }) => {
  const { meta } = useAskRoot();
  const read = useAtomValue(() => meta.board(props.block.film));
  const script = useAtomValue(() => meta.script(props.block.film));
  const beats = createMemo(() =>
    Option.map(AsyncResult.value(read()), (board) =>
      panelsShown(board, props.block, AsyncResult.value(script())),
    ),
  );
  return (
    <Framed
      kind="board"
      css={`
        ${PANEL_THUMB_CSS} ${BOARD_MAT_CSS}
      `}
      caption={Option.none()}
    >
      <Show
        when={Option.getOrUndefined(beats())}
        fallback={
          <Missing
            read={read()}
            what={`the Board of ${props.block.film}`}
            gone={`${props.block.film} has no Board`}
          />
        }
      >
        {(shown: Accessor<ReadonlyArray<BeatShown>>) => (
          <Show
            when={shown().length > 0}
            fallback={
              <p class="ak-mat-status" role="status" data-failed="true">
                The Board of {props.block.film} no longer has these panels
              </p>
            }
          >
            <div class="ak-board">
              <For each={shown()}>
                {(beat) => (
                  <section class="ak-board-beat" data-beat={beat.beat}>
                    <p class="ak-board-id">{beat.beat}</p>
                    <div class="ak-board-panels">
                      <For each={beat.panels}>
                        {(p) => (
                          <figure class="ak-board-panel" data-panel={p.panel.id}>
                            <PanelFigure
                              panel={p.panel}
                              thumb={<AskPanelThumb film={props.block.film} panel={p.panel} />}
                              words={p.words}
                              notes={0}
                            />
                          </figure>
                        )}
                      </For>
                    </div>
                  </section>
                )}
              </For>
            </div>
          </Show>
        )}
      </Show>
    </Framed>
  );
};

export const VideoPart = (props: { readonly block: BlockOf<'video'> }) => {
  const { state } = useAskRoot();
  const video = createMemo(() =>
    Option.flatMap(AsyncResult.value(state.index()), (index) => videoAt(index, props.block.ref)),
  );
  return (
    <Framed kind="video" css="" caption={Option.fromUndefinedOr(props.block.caption)}>
      <Show
        when={Option.getOrUndefined(video())}
        keyed
        fallback={
          <Missing
            read={state.index()}
            what={props.block.ref}
            gone={`${props.block.ref} is no longer in the review`}
          />
        }
      >
        {(v) => (
          <Show
            when={Option.getOrUndefined(videoSource(v, state.quality()))}
            fallback={<ProxyPending video={v} />}
          >
            {(src: Accessor<string>) => (
              <PlayedAlone
                src={src()}
                video={v}
                poster={reviewFrameUrl(v.ref, Option.none(), POSTER_W)}
                at={props.block.at}
                quiet
              />
            )}
          </Show>
        )}
      </Show>
    </Framed>
  );
};

export const AudioPart = (props: { readonly block: BlockOf<'audio'> }) => {
  const { meta } = useAskRoot();
  const attempts = meta.runtime
    .atom(AskApi.use((api) => api.attempts(props.block.film, props.block.beat)))
    .pipe(Atom.withServerValue(() => AsyncResult.initial()));
  const read = useAtomValue(() => attempts);
  const take = createMemo(() =>
    Option.flatMap(AsyncResult.value(read()), (a) =>
      takeHeard(props.block.film, a, Option.fromUndefinedOr(props.block.attempt)),
    ),
  );
  return (
    <Framed kind="audio" css={AUDIO_CSS} caption={Option.fromUndefinedOr(props.block.caption)}>
      <Show
        when={Option.getOrUndefined(take())}
        keyed
        fallback={
          <Missing read={read()} what="the take" gone={`No take of ${props.block.beat} to play`} />
        }
      >
        {(t) => (
          <>
            <audio class="ak-audio" controls preload="none" src={t.url} data-source={t.source} />
            <Show
              when={Option.getOrUndefined(t.heard)}
              fallback={<p class="ak-heard">The staging voice's take</p>}
            >
              {(heard) => <p class="ak-heard">{heard()}</p>}
            </Show>
          </>
        )}
      </Show>
    </Framed>
  );
};

const Markdown = (props: { readonly file: ReviewFile }) => {
  const { meta } = useAskRoot();
  const read = useAtomValue(() => meta.text(props.file));
  return (
    <div
      class="rv-note"
      innerHTML={Option.getOrElse(Option.map(AsyncResult.value(read()), markdownHtml), () =>
        Match.value(AsyncResult.isFailure(read())).pipe(
          Match.when(true, () => `<p class="rv-hint">${escapeHtml(failedText(read()))}</p>`),
          Match.orElse(() => '<p class="rv-hint">loading…</p>'),
        ),
      )}
    />
  );
};

interface Shown {
  readonly src: string;
  readonly caption: string;
}

const Zoom = (props: {
  readonly still: string;
  readonly alt: string;
  readonly shown: Shown;
  readonly name: string;
}) => {
  const { meta } = useAskRoot();
  const href = useAtomValue(() => UrlAtom.href);
  const address = addressOn(meta.host);
  const dismissal = useSheetDismissal(meta.host, (at, name) =>
    Option.exists(stillIn(at), (open) => open === name),
  );
  const open = () => Option.exists(stillIn(href()), (name) => name === props.name);
  const show = () =>
    Option.map(withStill(untrack(href), props.name), (to) => {
      dismissal.opening(props.name);
      address.go(to);
    });
  const close = () => dismissal.dismiss(() => withStill(untrack(href), ''));
  return (
    <>
      <button
        type="button"
        class="rv-zoom"
        aria-label={`Open ${props.shown.caption}`}
        onClick={show}
      >
        <img class="rv-media" loading="lazy" src={props.still} alt={props.alt} />
      </button>
      <Dialog.Root
        open={open()}
        onOpenChange={(next: boolean) => {
          if (!next) close();
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop class="rv-lightbox-backdrop" />
          <Dialog.Popup
            class="rv-lightbox"
            data-role="lightbox"
            data-still={props.name}
            onClick={close}
          >
            <img src={props.shown.src} alt={props.shown.caption} />
            <Dialog.Title class="rv-lightbox-caption">{props.shown.caption}</Dialog.Title>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};

const COPY_SAID = {
  pending: 'Phone copy on its way',
  ready: 'Phone copy on its way',
  failed: 'The phone copy could not be made',
} as const;

const CopySaid = (props: { readonly copy: PhoneCopy }) => (
  <span class="rv-pending-hint" data-copy={props.copy}>
    {COPY_SAID[props.copy]}
  </span>
);

const ProxyPending = (props: { readonly video: ReviewVideo }) => {
  const { actions } = useAskRoot();
  const failed = () => props.video.phone === 'failed';
  const still = () => reviewFrameUrl(props.video.ref, Option.none(), POSTER_W);
  const [undrawn, setUndrawn] = createSignal(Option.none<string>(), { ownedWrite: true });
  const drawn = () => !Option.contains(undrawn(), still());
  return (
    <div class="rv-pending" data-proxy={STATE_PROXY[`${failed()}`]}>
      <div class="rv-pending-picture">
        <Show when={drawn()} fallback={<div class="rv-media" aria-hidden="true" />}>
          <img
            class="rv-media"
            loading="lazy"
            alt=""
            src={still()}
            onError={(e) => setUndrawn(Option.some(e.currentTarget.getAttribute('src') ?? ''))}
          />
        </Show>
        <Show when={!failed()} fallback={<CopySaid copy="failed" />}>
          <CopyAwaited video={props.video} />
        </Show>
      </div>
      <p class="rv-row">
        <button type="button" class="sh-btn" onClick={() => actions.quality('full')}>
          Play the original ({sizeText(props.video.size)})
        </button>
      </p>
    </div>
  );
};

const STATE_PROXY = { true: 'failed', false: 'pending' } as const;

const CopyAwaited = (props: { readonly video: ReviewVideo }) => {
  const { actions, meta } = useAskRoot();
  const asked = useAtomValue(() => meta.phoneCopy(props.video.ref));
  const copy = () => Option.getOrElse(AsyncResult.value(asked()), (): PhoneCopy => 'pending');
  createEffect(copy, (now) => {
    if (now !== 'pending') actions.indexChanged();
  });
  return <CopySaid copy={copy()} />;
};
