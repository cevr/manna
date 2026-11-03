import { useAtomSet, useAtomValue } from '@manna/atom-solid';
import { Effect, Match, Option } from 'effect';
import { Machine } from 'effect-machine';
import * as ActorAtom from 'effect-machine/atom';
import { Show } from '@solidjs/web';
import {
  type Accessor,
  type ParentProps,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onSettled,
  untrack,
} from 'solid-js';
import type { ReviewDuration, ReviewFile } from '../../core/review.ts';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import type { LabFailure } from '../api.ts';
import { clock, timecode } from '../../core/time.ts';
import { type Playable, playableOf } from '../../browser/media.ts';
import { Actor } from '../actor.tsx';
import { PlayIcon } from '../page-shell.tsx';
import { useAskRoot } from './root.tsx';
import {
  SyncEvent,
  type SyncState,
  atRest,
  clockParts,
  lengthText,
  failureOf,
  reachOf,
  runningOf,
  UNTIMED_FPS,
  syncMachine,
  syncAt,
} from './sync-machine.ts';
import { type SyncDriver, makeSync } from './sync.ts';

const CANNOT_PLAY_CLOCK = 'Can’t play this video';

const TransportRow = (
  props: ParentProps<{
    readonly sync: Accessor<SyncState>;
    readonly send: (event: SyncEvent) => void;
    readonly scrubs: string;
    readonly title: string;
    readonly alone?: boolean;
    readonly quiet?: boolean;
  }>,
) => {
  const opened = untrack(() => syncAt(props.sync().audible, props.sync().start));
  const sync = createMemo(() => props.sync(), { ssrSource: 'client', loadingValue: opened });
  const send = { sync: props.send };
  const playing = () => runningOf(sync()) || sync()._tag === 'Buffering';
  const failure = () => failureOf(sync());
  const say = Match.value(props.alone === true).pipe(
    Match.when(true, () => clock),
    Match.orElse(() => timecode),
  );
  const time = () => clockParts(sync(), say);
  return (
    <section class={['rv-transport', { 'rv-alone-row': props.alone === true }]}>
      <button
        type="button"
        class="sh-btn rv-big"
        data-primary={Option.getOrUndefined(Option.liftPredicate('', () => props.quiet !== true))}
        data-tone={Option.getOrUndefined(Option.liftPredicate('quiet', () => props.quiet === true))}
        data-act="play"
        aria-label={Match.value(playing()).pipe(
          Match.when(true, () => 'Pause'),
          Match.orElse(() => 'Play'),
        )}
        title={props.title}
        disabled={Option.isSome(failure())}
        onClick={() => send.sync(SyncEvent.Toggled)}
      >
        <span aria-hidden="true">
          {Match.value(playing()).pipe(
            Match.when(true, () => '❚❚'),
            Match.orElse(() => '▶'),
          )}
        </span>
      </button>
      <span class="rv-time" data-state={sync()._tag}>
        <span class="rv-time-at">{time().at}</span>
        <span class="rv-time-rest">{time().rest}</span>
      </span>
      <Show
        when={Option.getOrUndefined(failure())}
        fallback={
          <input
            type="range"
            aria-label={props.scrubs}
            min={sync().start}
            max={reachOf(sync())}
            step="0.05"
            value={sync().t}
            onInput={(e) => send.sync(SyncEvent.ScrubMoved({ t: Number(e.currentTarget.value) }))}
            onChange={() => send.sync(SyncEvent.ScrubReleased)}
          />
        }
      >
        {(reason) => (
          <span class="rv-failed" data-role="failed" data-reason={reason()}>
            {CANNOT_PLAY_CLOCK}
          </span>
        )}
      </Show>
      {props.children}
    </section>
  );
};

const ALONE = 'alone';

const CANNOT_PLAY = 'Can’t play this video · Try again';

interface Try {
  readonly src: string;
  readonly n: number;
}

const useClockMedia = (driver: SyncDriver, id: string, joined?: (media: Playable) => void) => {
  let release = Option.none<() => void>();
  onCleanup(() => Option.map(release, (letGo) => letGo()));
  return (el: HTMLMediaElement) => {
    const media = playableOf(el);
    release = Option.some(driver.attach(id, media));
    Option.map(Option.fromUndefinedOr(joined), (told) => told(media));
  };
};

export const PlayedAlone = (
  props: ParentProps<{
    readonly src: string;
    readonly poster: string;
    readonly video: Pick<ReviewFile, 'ref' | 'mtime'>;
    readonly at?: number;
    readonly quiet?: boolean;
  }>,
) => {
  const { meta } = useAskRoot();
  const [retried, setRetried] = createSignal<Option.Option<Try>>(Option.none());
  const [settled, setSettled] = createSignal(false, { ownedWrite: true });
  onSettled(() => {
    setSettled(true);
  });
  let asked = Option.none<Try>();
  const takeAsked = (at: Try) => {
    const mine = Option.exists(asked, (a) => a.src === at.src && a.n === at.n);
    if (mine) asked = Option.none();
    return mine;
  };
  const current = createMemo((): Try => ({
    src: props.src,
    n: Option.getOrElse(
      Option.map(
        Option.filter(retried(), (r) => r.src === props.src),
        (r) => r.n,
      ),
      () => 0,
    ),
  }));
  return (
    <Actor
      runtime={meta.runtime}
      spawn={Machine.spawn(
        syncMachine(
          ALONE,
          0,
          untrack(() => Option.getOrElse(Option.fromUndefinedOr(props.at), () => 0)),
        ),
      ).pipe(Effect.tap((actor) => actor.start))}
    >
      {(actor) => {
        const syncAtom = ActorAtom.make(actor);
        const sync = useAtomValue(() => syncAtom);
        const send = useAtomSet(() => syncAtom);
        const driver = makeSync(ALONE, send, meta.host);
        useClockRate(() => Option.some(props.video), send);
        onCleanup(driver.stop);
        createEffect(sync, (state) => driver.apply(state));
        const failure = () => failureOf(sync());
        const failed = () => Option.isSome(failure());
        const label = () =>
          Option.match(failure(), { onNone: () => 'Play / pause', onSome: () => CANNOT_PLAY });
        return (
          <>
            <button
              type="button"
              class="rv-alone-picture"
              data-act="play-video"
              title={label()}
              aria-label={label()}
              onClick={() => {
                if (!failed()) return send(SyncEvent.Toggled);
                const at = untrack(current);
                const next = { src: at.src, n: at.n + 1 };
                asked = Option.some(next);
                setRetried(Option.some(next));
              }}
            >
              <Show when={current()} keyed>
                {(at: Try) => {
                  const ref = useClockMedia(driver, ALONE);
                  if (takeAsked(at)) onSettled(() => send(SyncEvent.Toggled));
                  return (
                    <video
                      class="rv-media"
                      preload="metadata"
                      playsinline
                      poster={props.poster}
                      src={at.src}
                      ref={ref}
                    >
                      {props.children}
                    </video>
                  );
                }}
              </Show>
              <Show when={failed()}>
                <span
                  class="rv-failed"
                  data-role="failed"
                  data-reason={Option.getOrElse(failure(), () => '')}
                >
                  {CANNOT_PLAY}
                </span>
              </Show>
              <Show when={atRest(sync()) && !failed()}>
                <span class="rv-rest" data-role="at-rest" aria-hidden="true">
                  <span class="rv-rest-play">
                    <PlayIcon />
                  </span>
                  <Show
                    when={Option.getOrUndefined(Option.filter(lengthText(sync()), () => settled()))}
                  >
                    {(length: Accessor<string>) => <span class="rv-rest-length">{length()}</span>}
                  </Show>
                </span>
              </Show>
            </button>
            <Show when={!atRest(sync()) && !failed()}>
              <TransportRow
                sync={sync}
                send={send}
                scrubs="Scrub the video"
                title="Play / pause"
                alone
                quiet={props.quiet}
              />
            </Show>
          </>
        );
      }}
    </Actor>
  );
};

const untimed = Atom.make(AsyncResult.initial<ReviewDuration, LabFailure>()).pipe(
  Atom.withServerValue(() => AsyncResult.initial<ReviewDuration, LabFailure>()),
);

const useClockRate = (
  video: Accessor<Option.Option<Pick<ReviewFile, 'ref' | 'mtime'>>>,
  send: (event: SyncEvent) => void,
) => {
  const { meta } = useAskRoot();
  const timed = useAtomValue(() =>
    Option.match(video(), { onNone: () => untimed, onSome: meta.timedHere }),
  );
  createEffect(
    () =>
      Option.getOrElse(
        Option.flatMap(AsyncResult.value(timed()), (t) => t.fps),
        () => UNTIMED_FPS,
      ),
    (fps) => send(SyncEvent.Timed({ fps })),
  );
};
