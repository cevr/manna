// A series draft an ask's script section shows, in the lab's Script reader
// (`words/reader.tsx`): the draft's beats as its Markdown reads now
// (`core/draft.ts`), over the draft's routes: its staging takes, its
// delivery marks written into the draft's Markdown (`POST …/marks`, one cell
// changed and not another byte), the draft as the write leaves it shown and
// its takes read again, the beat's new take queued first. The words selected
// are the section's own (`selecting`, which the ask gives).

import { useAtomRefresh, useAtomValue } from '@manna/atom-solid';
import { Show } from '@solidjs/web';
import { Effect, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { createMemo, createSignal, untrack } from 'solid-js';
import { type DraftRead, draftTakeUrl } from '../../core/api.ts';
import { reasonOf } from '../api.ts';
import { STATUS_ROLE, ScriptReader, type Selecting } from '../words/reader.tsx';
import { AskApi } from './api.ts';
import { useAskRoot } from './root.tsx';

/**
 * Series draft `draft` of `series` in the reader, as its Markdown reads now:
 * its beats (only those `only` names, when it names some), or why it cannot
 * be read; a mark write's answer, the draft as the write left it, stands
 * over the read it was sent over until the draft is read again. With
 * `cost`, its head says the day's staging spend.
 */
export const DraftReader = (props: {
  readonly series: string;
  readonly draft: string;
  readonly only: Option.Option<ReadonlyArray<string>>;
  readonly selecting: Selecting;
  readonly cost: boolean;
}) => {
  const { meta } = useAskRoot();
  const read = useAtomValue(() => meta.draft(props.series, props.draft));
  const again = useAtomRefresh(() => meta.draft(props.series, props.draft));
  // A refresh since outranks an answer sent over an older read.
  const [answered, setAnswered] = createSignal(
    Option.none<{ readonly read: DraftRead; readonly over: Option.Option<DraftRead> }>(),
    { ownedWrite: true },
  );
  const shown = createMemo(() => {
    const now = AsyncResult.value(read());
    return Option.getOrElse(
      Option.map(
        Option.filter(
          answered(),
          (a) => Option.getOrUndefined(a.over) === Option.getOrUndefined(now),
        ),
        (a) => Option.some(a.read),
      ),
      () => now,
    );
  });
  const beats = () =>
    Option.match(shown(), {
      onNone: () => [],
      onSome: (d) =>
        Option.match(props.only, {
          onNone: () => d.beats,
          onSome: (only) => d.beats.filter((b) => only.includes(b.id)),
        }),
    });
  return (
    <Show
      when={Option.isSome(shown())}
      fallback={
        <p class="dr-status" role={STATUS_ROLE[`${AsyncResult.isFailure(read())}`]}>
          {AsyncResult.match(read(), {
            onInitial: () => 'Reading the draft…',
            onFailure: (f) => `Could not read the draft: ${reasonOf(f.cause)}`,
            onSuccess: () => '',
          })}
        </p>
      }
    >
      <ScriptReader
        page={{
          host: meta.host,
          hub: meta.hub,
          runtime: meta.runtime,
          playhead: Option.none(),
          noting: Option.none(),
        }}
        beats={beats}
        selecting={props.selecting}
        cost={props.cost}
        source={{
          voice: AskApi.use((api) => api.draftVoice(props.series, props.draft)),
          // The answer is bound to the read the write was sent over: a refresh since outranks it.
          // A refusal (the words changed since) reads the draft again, its words as they are.
          mark: (post) => {
            const over = untrack(() => AsyncResult.value(read()));
            return AskApi.use((api) => api.draftMarks(props.series, props.draft, post)).pipe(
              Effect.tap((next) =>
                Effect.sync(() => setAnswered(Option.some({ read: next, over }))),
              ),
              Effect.tapError(() => Effect.sync(again)),
            );
          },
          takeUrl: (file) => draftTakeUrl(props.series, props.draft, file),
          written: 'marked in the draft',
          reread: again,
        }}
      />
    </Show>
  );
};

/** A draft's names, as `useDraftTitles` reads them. */
interface DraftTitles {
  readonly series: () => string;
  readonly draft: () => string;
}

/**
 * Series draft `draft` of `series` by its names as the owner knows them:
 * its series' title, once the series are read, and its own, once it is
 * (each its file's name until then). The draft page's head and an ask's
 * script, alike.
 */
export const useDraftTitles = (series: string, draft: string): DraftTitles => {
  const { meta, state } = useAskRoot();
  const read = useAtomValue(() => meta.draft(series, draft));
  return {
    series: () =>
      Option.getOrElse(
        Option.flatMap(AsyncResult.value(state.series()), (l) =>
          Option.map(
            Option.fromUndefinedOr(l.series.find((s) => s.name === series)),
            (s) => s.title,
          ),
        ),
        () => series,
      ),
    draft: () =>
      Option.getOrElse(
        Option.map(AsyncResult.value(read()), (d) => d.title),
        () => draft,
      ),
  };
};
