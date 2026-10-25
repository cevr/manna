// The material an ask's section shows, in place, each through the part its
// own view draws it with, over the same reads: a set's document as the set's
// page reads it (`Markdown`, a long one clamped with Read all, so the
// question stays near it), a script in the Script reader (a film's or a
// series draft's, named as its page names it, its staging takes played and
// its delivery marks written as on the Script and draft pages), the Board's
// panels as the Board shows them (`PanelFigure`: each thumb, the words it
// holds over and its mark; a still opens large), a video in the review's
// player (`PlayedAlone`), a take as the studio plays it. Each part says
// where its material stands while it is not shown: read under way, could
// not be read (and why), or no longer there. Each part carries its own look
// (`PlaceStyle`), so it rides only on a page that shows it. Nothing here is
// a copy of a view: a fix to the view is a fix here.

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

/**
 * The material's own look: a box the width of its section (its one column
 * never wider, so a video's own size cannot widen the page), its caption
 * under it; a long document clamped in its panel, whose edge stays sharp
 * while only the words fade, its toggle inside it.
 */
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

/** The Board's panels in an ask: a beat's panels in a row under its id, at the film's aspect; two to a row at least 240 px wide on a laptop. */
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

/** The take's player: the width of the section, its words under it. */
const AUDIO_CSS = `
.ak-audio{display:block;width:100%;min-height:var(--hit)}
.ak-heard{margin:0;color:var(--text-1)}
`;

/** A material part's frame: its look, the part, and its caption when it has one. */
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

/** Why the material is not shown: its read under way, failed (and why), or the material gone from it. */
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

/**
 * `children` clamped to about twelve lines, with Read all, once they run
 * longer: the question under a long document stays a short scroll away. The
 * box is held at the clamp until Read all opens it, so its words are
 * measured against the clamp itself (a box opened while it measures would
 * always fit its words); it watches their height (a document's text arrives
 * after it is drawn), and fades and offers Read all only once there is more
 * to read. Read all is a toggle (Show less once open, `aria-expanded`) in
 * the panel, under the words: it keeps the focus either way.
 */
const Clamped = (props: ParentProps) => {
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  const [long, setLong] = createSignal(false, { ownedWrite: true });
  let outer = Option.none<HTMLElement>();
  let words = Option.none<HTMLElement>();
  // Once laid out, and as the words grow (a document's text arrives after it is drawn).
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
  // Show less folds the words back under the button, which keeps the focus; the
  // document's top comes back into view when it had scrolled past.
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

/** A set's Markdown, as the set's page reads it, clamped while it is long. */
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

/** A series draft in the reader, named as its page names it: its series, then its title. */
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

/**
 * A script in the Script reader: a film's, or a series draft's, every beat
 * or those named. A block never changes once the ask is read, so its source
 * is read once, as plain names: a reader keyed on a condition's value would
 * read it untracked in its own effects.
 */
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

/** A panel of an ask's Board, and the words its beat's line says while it holds. */
interface PanelShown {
  readonly panel: Panel;
  readonly words: string;
}

/** A beat of an ask's Board: its id, and its panels the ask names. */
interface BeatShown {
  readonly beat: string;
  readonly panels: ReadonlyArray<PanelShown>;
}

/**
 * The panels `block` names of `board`, by beat in the board's order (every
 * panel, when it names none), each with the words its beat's line says
 * while it holds (from its mark to the next panel's of its beat, named or
 * not), its line as `script` reads it (none until it is read).
 */
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

/** A panel's thumb in an ask: its still opens large (`?still=`); a card's words, and a panel with no try, stand as they are. */
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

/** A film's Board: the panels named, each as the Board shows it, by beat. */
export const BoardPart = (props: { readonly block: BlockOf<'board'> }) => {
  const { meta } = useAskRoot();
  const read = useAtomValue(() => meta.board(props.block.film));
  // The words each panel holds over are the script's: read as every reader of the film reads it.
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

/** A video the review serves, in the review's player, from `at`. */
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

/**
 * A take of a film's beat, as the studio plays it (`takeHeard`): the attempt
 * named, else the take its timings name (an attempt kept, or the staging
 * voice's), and what was heard of an attempt.
 */
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

/**
 * A markdown file's text, shown as HTML (every character of it escaped
 * first): the file as the index names it, so a file written again is read again.
 */
export const Markdown = (props: { readonly file: ReviewFile }) => {
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

/** An image the lightbox shows: its source, and the caption under it (what its card no longer says). */
interface Shown {
  readonly src: string;
  readonly caption: string;
}

/**
 * A still that opens full size in the lightbox, with its caption (`shown`):
 * a button, so a tap, a click, Enter and Space all open it, and its name
 * says what opens. The URL keeps it open (`?still=` its `name`), so a link
 * opens it, and Back closes it as every sheet's opening is. The lightbox is
 * the kit's dialog over every other layer of the page (the header and the
 * dock too), titled by its caption: focus moves into it and back to the
 * still, and Escape or a tap anywhere closes it, by the sheets' one rule
 * (`useSheetDismissal`), adding no entry.
 */
export const Zoom = (props: {
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

/** What a video with no phone copy to play says across its picture: on its way, or failed. */
const COPY_SAID = {
  pending: 'Phone copy on its way',
  ready: 'Phone copy on its way',
  failed: 'The phone copy could not be made',
} as const;

/** What a video with no phone copy to play says across its picture, as its copy stands (`copy`). */
const CopySaid = (props: { readonly copy: PhoneCopy }) => (
  <span class="rv-pending-hint" data-copy={props.copy}>
    {COPY_SAID[props.copy]}
  </span>
);

/**
 * In a video's place while it has no phone copy to play, on Proxy: its
 * still with what is happening across its foot (so the box says so before
 * the still has come), on its way or failed, and the way to play the
 * Original instead. The original is never streamed in its place unasked.
 * While the index has the copy on its way the page asks after it every few
 * seconds (`CopyAwaited`) and says what it hears; once the copy is made or
 * has failed, the page reads the index again, and the video plays in its
 * place, or says it failed (on a Set, Choices and an ask alike).
 */
export const ProxyPending = (props: { readonly video: ReviewVideo }) => {
  const { actions } = useAskRoot();
  const failed = () => props.video.phone === 'failed';
  // Its still, while it can be drawn: one that cannot (a video no frame is read from) leaves the
  // box empty at its 16:9, never a broken image. Kept by the still's address, so another video's
  // is drawn afresh.
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

/** A video's `data-proxy`, by whether its phone copy failed. */
const STATE_PROXY = { true: 'failed', false: 'pending' } as const;

/**
 * Asks after video `video`'s phone copy while it is on its way, and says
 * what it hears; once the copy is made or has failed, the index is read
 * again (it says so too, or the video plays).
 */
const CopyAwaited = (props: { readonly video: ReviewVideo }) => {
  const { actions, meta } = useAskRoot();
  const asked = useAtomValue(() => meta.phoneCopy(props.video.ref));
  const copy = () => Option.getOrElse(AsyncResult.value(asked()), (): PhoneCopy => 'pending');
  createEffect(copy, (now) => {
    if (now !== 'pending') actions.indexChanged();
  });
  return <CopySaid copy={copy()} />;
};
